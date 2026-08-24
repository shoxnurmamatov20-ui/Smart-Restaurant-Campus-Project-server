import { describe, expect, it } from 'vitest';

import { settlementIdFrom, statementFrom } from './settlement-server';

/**
 * The one document on this surface that is about money somebody is owed.
 *
 * Every other sheet here is a record of something that already happened — a
 * shift closed, a delivery accepted, a stock count taken. A settlement is a
 * claim: a merchant reconciles their bank account against it and an accountant
 * files it. So the assertions below are all about a figure or a name that would
 * be wrong on paper and look perfectly normal.
 *
 * Money is integer tiyin throughout, and the dates are asserted exactly rather
 * than "roughly" — the period printed on a statement is what decides which
 * week's takings it is about.
 */
function detail(over: Record<string, unknown> = {}) {
  const { statement: statementOver, ...rest } = over;

  return {
    id: 833,
    state: 'due',
    orders: [
      {
        id: 1,
        number: 'MP-8421',
        delivered_at: '2026-08-12T18:04:00Z',
        total_tiyin: 11_800_000,
        subtotal_tiyin: 11_000_000,
        commission_tiyin: 1_062_000,
        merchant_due_tiyin: 10_738_000,
      },
    ],
    placements: [{ id: 7, slot: 'home_top', days: 2, total_tiyin: 64_000_000 }],
    statement: {
      invoice_number: 'MP-INV-2026-0833',
      issued_on: '2026-08-17',
      period_start: '2026-08-10',
      period_end: '2026-08-16',
      store: { name: 'Osh Xona', slug: 'osh-xona' },
      tenant: { name: 'Osh Xona MChJ', inn: '302481776' },
      lines: [
        {
          label: { uz: 'Yetkazilgan buyurtmalar', ru: 'Доставленные заказы', en: 'Delivered' },
          count: 214,
          amount_tiyin: 2_418_000_000,
        },
      ],
      gross_tiyin: 2_418_000_000,
      commission_tiyin: 217_620_000,
      adjustments_tiyin: -2_400_000,
      payable_tiyin: 2_198_000_000,
      payout: {
        bank_name: 'Kapitalbank',
        mfo: '00450',
        account_last4: '9012',
        inn: '302481776',
        holder: 'OSH XONA MCHJ',
        state: 'verified',
      },
      ...((statementOver as Record<string, unknown>) ?? {}),
    },
    ...rest,
  } as Parameters<typeof statementFrom>[0];
}

describe('statementFrom', () => {
  it('keeps every figure exactly as the statement issued it', () => {
    /*
     * The whole reason a statement is quotable: a merchant reading it a month
     * later gets the numbers they reconciled their bank account against,
     * whatever has happened to the orders behind it since. Nothing here is
     * recomputed from the order rows beside it.
     */
    const doc = statementFrom(detail());

    expect(doc.gross).toBe(2_418_000_000);
    expect(doc.commission).toBe(217_620_000);
    expect(doc.adjustments).toBe(-2_400_000);
    expect(doc.payable).toBe(2_198_000_000);
  });

  it('prints the period in the paper’s own language, both ends of it', () => {
    // Uzbek regardless of who is previewing: the sheet an accountant signs must
    // not come off the printer differently depending on who pressed the button.
    const doc = statementFrom(detail());

    expect(doc.period).toBe('10.08.2026 — 16.08.2026');
    expect(doc.issuedOn).toBe('17.08.2026');
  });

  it('prints an em dash rather than “Invalid Date” on a missing delivery', () => {
    const doc = statementFrom(
      detail({
        orders: [
          {
            id: 1,
            number: 'MP-8400',
            delivered_at: null,
            total_tiyin: 1,
            subtotal_tiyin: 1,
            commission_tiyin: 1,
            merchant_due_tiyin: 1,
          },
        ],
      }),
    );

    expect(doc.orders[0]?.delivered).toBe('—');
  });

  it('names the store, the legal entity and its INN separately', () => {
    // Three different things a bank asks for, and a statement that conflated
    // them is one an accountant hands back.
    const doc = statementFrom(detail());

    expect(doc.storeName).toBe('Osh Xona');
    expect(doc.tenantName).toBe('Osh Xona MChJ');
    expect(doc.tenantInn).toBe('302481776');
  });

  it('prints the summary lines in Uzbek, like every other word on the paper', () => {
    expect(statementFrom(detail()).lines[0]?.label).toBe('Yetkazilgan buyurtmalar');
  });

  it('names the advertising slot rather than printing its key', () => {
    expect(statementFrom(detail()).placements[0]?.label).toBe('Bosh sahifa lentasi');
  });

  it('keeps only the last four of the account on a sheet that gets photographed', () => {
    const doc = statementFrom(detail());

    expect(doc.bank?.accountLast4).toBe('9012');
    expect(doc.bankVerified).toBe(true);
  });

  it('says an account is still under review rather than implying it will pay', () => {
    const doc = statementFrom(
      detail({ statement: { payout: { bank_name: 'Kapitalbank', state: 'pending_review' } } }),
    );

    expect(doc.bankVerified).toBe(false);
  });

  it('reports no bank at all rather than a row of dashes that reads as filled in', () => {
    // A statement with nowhere to pay must not print as a blank space somebody
    // reads as an oversight — the sheet draws a warning on `null`.
    expect(statementFrom(detail({ statement: { payout: null } })).bank).toBeNull();
  });

  it('marks a settled week and treats anything else as still owed', () => {
    expect(statementFrom(detail({ state: 'paid' })).paid).toBe(true);
    expect(statementFrom(detail()).paid).toBe(false);
  });
});

describe('settlementIdFrom', () => {
  it('takes a whole positive id and nothing else', () => {
    expect(settlementIdFrom('833')).toBe(833);
    expect(settlementIdFrom(['833', '9'])).toBe(833);
  });

  it('refuses everything a document must never be built from', () => {
    /*
     * `?id=` is in the address bar of a page that prints a claim for money. An
     * id it cannot parse has to become "no document" rather than a request with
     * a guess in it.
     */
    expect(settlementIdFrom(undefined)).toBeNull();
    expect(settlementIdFrom('')).toBeNull();
    expect(settlementIdFrom('0')).toBeNull();
    expect(settlementIdFrom('-4')).toBeNull();
    expect(settlementIdFrom('4.5')).toBeNull();
    expect(settlementIdFrom('MP-INV-2026-0833')).toBeNull();
    expect(settlementIdFrom('4 OR 1=1')).toBeNull();
  });
});
