import { describe, expect, it, vi } from 'vitest';

/*
 * `vi.hoisted` because `vi.mock` is lifted above the imports: a plain
 * `const apiGet = vi.fn()` would still be in its temporal dead zone when the
 * factory runs.
 */
const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('@/lib/api-server', () => ({ apiGet }));

import { shiftDocumentFixture, SHIFT, type ShiftDocument } from './till-data';
import { getShiftReport, getTill, receiptsFrom } from './till-server';

/**
 * The drawer, and the three ways this mapping can be quietly wrong.
 *
 * Every figure here ends up next to a cashier's name at the end of a shift, so
 * the failures worth a test are the ones that still look like a normal screen:
 *
 *   **Somebody else's money.** `GET /finance/payments` and `/finance/expenses`
 *   answer the restaurant's whole history a page at a time. Asked without a
 *   shift, this drawer shows last week's takings as though they were in the box
 *   tonight — and the total under the table would still add up.
 *
 *   **A drop that was a refund.** Both leave the drawer and both arrive as a
 *   cash-paid expense; only `category` tells them apart, because
 *   `EloquentTillLedger` writes `other` for a collection and `refund` for a
 *   reversed bill. Adding them together credits the safe with money a guest
 *   walked out with.
 *
 *   **The stale column.** `CashShiftResource.expected_cash` is stored, not
 *   computed, and the API writes it once — at close. Reading it on an open
 *   shift gives zero, which is the state this screen is nearly always in.
 */

/** Money is integer tiyin. 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

/** A live document for shift 12, with the drawer figures the tests care about. */
function liveDocument(over: Partial<ShiftDocument['drawer']> = {}): ShiftDocument {
  const demo = shiftDocumentFixture();

  return {
    ...demo,
    shift: { ...demo.shift, id: 12, opened_at: '2026-08-21T09:00:00+05:00' },
    turnover: {
      takings: som(9_000_000),
      refunded: som(50_000),
      bills: 40,
      payments: 44,
      average_bill: som(225_000),
    },
    drawer: { ...demo.drawer, opening_cash: som(500_000), expected_cash: som(7_777_000), ...over },
    live: true,
  };
}

function payment(over: Record<string, unknown> = {}) {
  return {
    order_number: 'A-1291',
    method: 'cash',
    amount: som(200_000),
    status: 'captured',
    paid_at: '2026-08-21T11:20:00+05:00',
    refunded_at: null,
    ...over,
  };
}

function expense(over: Record<string, unknown> = {}) {
  return {
    cash_shift_id: 12,
    category: 'other',
    description: 'Inkassatsiya',
    amount: som(1_000_000),
    paid_in_cash: true,
    spent_at: '2026-08-21T16:30:00+05:00',
    ...over,
  };
}

/**
 * Answer each request by the path it asked for, and remember the paths.
 *
 * Routed rather than queued in order: `getTill` fires both inside one
 * `Promise.all`, and a test that depended on the order of that array would pass
 * until somebody reordered two lines that are explicitly unordered.
 */
function serve({
  payments,
  expenses,
}: {
  payments: unknown[] | null;
  expenses?: unknown[] | null;
}): string[] {
  const asked: string[] = [];

  apiGet.mockReset();
  apiGet.mockImplementation((path: string) => {
    asked.push(path);

    if (path.startsWith('/finance/payments')) {
      return Promise.resolve(payments === null ? null : { data: payments });
    }
    if (path.startsWith('/finance/expenses')) {
      return Promise.resolve(expenses == null ? null : { data: expenses });
    }

    if (path.startsWith('/finance/fiscal/receipts')) {
      return Promise.resolve({ data: [], summary: { pending: 0 } });
    }

    return Promise.resolve(null);
  });

  return asked;
}

/** The page hands `t` in so movement labels resolve; the key back is enough here. */
const t = (key: string): string => key;

describe('getTill', () => {
  it('asks for this shift only', async () => {
    const asked = serve({ payments: [payment()], expenses: [expense()] });

    await getTill(t, Promise.resolve(liveDocument()));

    // Four reads: the payments, the payouts, the fiscal documents and the tip
    // sheet. Every one of them is about THIS shift — unfiltered they answer
    // the restaurant's whole history a page at a time, and the drawer would
    // show yesterday's takings as though they were in the box tonight. The
    // tip sheet takes the shift in its path rather than a filter, because it
    // is a read of one shift and not a list narrowed to one.
    expect(asked).toHaveLength(4);
    for (const path of asked) {
      expect(path.includes('filter[shift]=12') || path.includes('/shifts/12/tips')).toBe(true);
    }
  });

  it('takes the expected figure from the document, not the shift row', async () => {
    serve({ payments: [payment()], expenses: [] });

    const till = await getTill(t, Promise.resolve(liveDocument()));

    expect(till.expected).toBe(som(7_777_000));
  });

  it('counts collections as dropped and refunds as not', async () => {
    serve({
      payments: [payment()],
      expenses: [
        expense({ amount: som(1_200_000) }),
        expense({ category: 'refund', amount: som(86_000), description: 'Qaytarish' }),
        // Paid by transfer: it never passed through the drawer at all.
        expense({ category: 'other', amount: som(9_000_000), paid_in_cash: false }),
      ],
    });

    const till = await getTill(t, Promise.resolve(liveDocument()));

    expect(till.dropped).toBe(som(1_200_000));
  });

  it('lists the float, the cash bills and every cash payout, and nothing else', async () => {
    serve({
      payments: [
        payment({ order_number: 'A-1', amount: som(200_000) }),
        payment({ order_number: 'A-2', method: 'card', amount: som(4_000_000) }),
      ],
      expenses: [expense({ description: 'Seyfga' }), expense({ paid_in_cash: false })],
    });

    const till = await getTill(t, Promise.resolve(liveDocument()));

    expect(till.moves.map((move) => move.label)).toEqual(['mFloat', 'A-1', 'Seyfga']);
    expect(till.moves.map((move) => move.into)).toEqual([true, true, false]);
    expect(till.moves[0]!.amount).toBe(som(500_000));
  });

  it('counts payments the shift took, not the rows one page returned', async () => {
    serve({ payments: [payment()], expenses: [] });

    const till = await getTill(t, Promise.resolve(liveDocument()));

    expect(till.receipts).toBe(44);
    expect(till.refunds).toBe(som(50_000));
    expect(till.sales).toBe(som(9_000_000));
  });

  it('draws the fixtures when the document is the demo one', async () => {
    const asked = serve({ payments: [payment()], expenses: [expense()] });

    const till = await getTill(t, Promise.resolve(shiftDocumentFixture()));

    // Not asked for at all: there is no shift to ask about.
    expect(asked).toHaveLength(0);
    expect(till.dropped).toBe(SHIFT.droppedTiyin);
    expect(till.sales).toBe(SHIFT.salesTiyin);
  });

  it('falls back to the fixtures when the payments call fails', async () => {
    serve({ payments: null, expenses: [expense()] });

    const till = await getTill(t, Promise.resolve(liveDocument()));

    expect(till.sales).toBe(SHIFT.salesTiyin);
    expect(till.expected).not.toBe(som(7_777_000));
  });
});

/**
 * The two answers that used to be one.
 *
 * `GET /finance/shifts` replying `[]` is a restaurant that has never opened a
 * till; `apiGet` replying `null` is no session or an API mid-restart. Both took
 * the same branch, so a brand-new venue was shown shift Z-0001 open since
 * 09:00, with takings, payment counts, an expected drawer figure and a movement
 * list — every one of them invented, on the screen a cashier is counted
 * against.
 */
describe('getShiftReport', () => {
  it('answers null when the API replied and there is no shift', async () => {
    apiGet.mockReset();
    apiGet.mockResolvedValueOnce({ data: [] });

    expect(await getShiftReport()).toBeNull();
  });

  it('keeps the demo document when there was no answer at all', async () => {
    apiGet.mockReset();
    apiGet.mockResolvedValueOnce(null);

    const report = await getShiftReport();

    expect(report?.live).toBe(false);
    expect(report?.shift.number).toBe('Z-0001');
  });
});

describe('getTill with no shift', () => {
  it('reports zeroes rather than the demo drawer', async () => {
    apiGet.mockReset();

    const till = await getTill(t, Promise.resolve(null));

    expect(till).toMatchObject({
      moves: [],
      sales: 0,
      receipts: 0,
      refunds: 0,
      dropped: 0,
      expected: 0,
    });
    // Nothing was asked for: there is no shift to ask about.
    expect(apiGet).not.toHaveBeenCalled();
  });
});

/**
 * The receipts tab, which drew the design's six rows on a live drawer.
 *
 * A cashier was offered "reprint A-1291" for a bill belonging to the handoff
 * document. The rows are one per PAYMENT — only a payment knows the tender —
 * with the fiscal side contributing the sign and the id a NUSXA copy is asked
 * for by.
 */
describe('receiptsFrom', () => {
  const paid = (over: Partial<Parameters<typeof receiptsFrom>[0][number]> = {}) => ({
    id: 1,
    order_number: 'A-1291',
    method: 'cash',
    amount: 7_400_000,
    status: 'captured',
    paid_at: '2026-08-20T13:42:00+05:00',
    refunded_at: null,
    ...over,
  });

  it('joins the fiscal sign and the id a copy is asked for by', () => {
    const rows = receiptsFrom(
      [paid()],
      [{ id: 55, order_number: 'A-1291', kind: 'sale', fiscal_sign: 'FP 4417 2298' }],
    );

    expect(rows[0]).toMatchObject({
      id: '55',
      order: 'A-1291',
      at: '13:42',
      fiscalSign: 'FP 4417 2298',
    });
  });

  it('leaves a queued receipt without a numeric id, so no copy can be asked for', () => {
    const rows = receiptsFrom([paid({ id: 9 })], []);

    // `apiId()` answers null for this, which is what stops the button claiming
    // a piece of paper the state has never heard of exists.
    expect(rows[0].id).toBe('p9');
    expect(rows[0].fiscalSign).toBeNull();
  });

  it('does not list a reversal twice', () => {
    const rows = receiptsFrom(
      [paid({ refunded_at: '2026-08-20T14:10:00+05:00' })],
      [
        { id: 55, order_number: 'A-1291', kind: 'sale', fiscal_sign: 'FP 1' },
        { id: 56, order_number: 'A-1291', kind: 'refund', fiscal_sign: 'FP 2' },
      ],
    );

    expect(rows).toHaveLength(1);
    // Struck through, with its face value intact: negating it would make the
    // column stop adding up to the takings above it.
    expect(rows[0]).toMatchObject({ voided: true, amount: 7_400_000, fiscalSign: 'FP 1' });
  });

  it('shows the newest receipt first, which is the one being asked about', () => {
    const rows = receiptsFrom(
      [
        paid({ id: 1, order_number: 'A-1', paid_at: '2026-08-20T12:00:00+05:00' }),
        paid({ id: 2, order_number: 'A-2', paid_at: '2026-08-20T13:00:00+05:00' }),
      ],
      [],
    );

    expect(rows.map((row) => row.order)).toEqual(['A-2', 'A-1']);
  });
});
