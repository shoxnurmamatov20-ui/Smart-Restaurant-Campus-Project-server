import { describe, expect, it } from 'vitest';

import { CURRENCY_WORD, MINUTE_WORD } from '@restaurant/surfaces/crew/data';
import { foundTablesFrom } from '@restaurant/surfaces/crew/live';
import { floorFrom, queueFrom } from './crew-server';

/**
 * The two joins the staff app is wrong about silently.
 *
 * Everything else on these screens is a rendering decision a person notices —
 * a chip in the wrong colour, a word in the wrong language. These two are
 * arithmetic over two payloads, and getting either wrong produces a screen that
 * looks perfectly normal and is about somebody else:
 *
 *   `floorFrom` decides which tables a waiter is shown and what each one owes.
 *   Wrong, it shows another section's totals, or hides a table with four people
 *   sitting at it waiting to order.
 *
 *   `queueFrom` decides which of three headings a till's request appears under.
 *   Wrong, a manager approves a refund believing it is a discount.
 *
 * The clock is a parameter in both, so these assert exact minutes rather than
 * "roughly" — which is not a thing to be approximate about when the number is
 * how long a party has been waiting.
 */
const NOW = Date.parse('2026-08-20T20:00:00Z');

const HALLS = [
  { id: 1, name: { uz: 'ZAL', ru: 'ZAL', en: 'ZAL' } },
  { id: 2, name: { uz: 'VIP', ru: 'VIP', en: 'VIP' } },
];

function table(over: Partial<Parameters<typeof floorFrom>[0][number]> = {}) {
  return {
    id: 12,
    label: '12',
    seats: 4,
    status: 'seated',
    is_active: true,
    hall: { id: 1 },
    ...over,
  };
}

function order(over: Partial<Parameters<typeof floorFrom>[2][number]> = {}) {
  return {
    id: 900,
    status: 'open',
    is_open: true,
    table: { id: 12, label: '12' },
    guests_count: 4,
    total: 28_400_000,
    placed_at: '2026-08-20T19:12:00Z',
    ...over,
  };
}

describe('floorFrom — a waiter’s own section', () => {
  it('shows a table only when this waiter has an open order on it', () => {
    /*
     * The filter that matters. The orders payload is already narrowed
     * server-side by `filter[waiter]`, so a table with no order in it is either
     * somebody else's or nobody's — and a phone that drew every table in the
     * building would be one screenshot away from another section's totals.
     */
    const floor = floorFrom([table(), table({ id: 7, label: '7' })], HALLS, [order()], 'uz', NOW);

    expect(floor.tables.map((row) => row.number)).toEqual(['12']);
  });

  it('carries the running total and how long they have been sitting', () => {
    const floor = floorFrom([table()], HALLS, [order()], 'uz', NOW);

    expect(floor.tables[0]?.total).toBe(28_400_000);
    // 19:12 → 20:00 is forty-eight minutes, and the screen says so exactly.
    expect(floor.tables[0]?.minutes).toBe(48);
  });

  it('keeps the earliest bill when a table carries several', () => {
    /*
     * A table legitimately holds up to four bills. "How long has this party
     * been sitting" is a question about the party, so the oldest one answers
     * it — the newest cheque was opened when the fourth person joined.
     */
    const floor = floorFrom(
      [table()],
      HALLS,
      [
        order({ id: 901, placed_at: '2026-08-20T19:40:00Z', total: 5_000_000 }),
        order({ id: 900, placed_at: '2026-08-20T19:12:00Z', total: 28_400_000 }),
      ],
      'uz',
      NOW,
    );

    expect(floor.tables[0]?.minutes).toBe(48);
    expect(floor.tables[0]?.total).toBe(28_400_000);
  });

  it('lets the bill outrank a table row nobody updated', () => {
    // Somebody sat a party without touching the floor plan, which is ordinary
    // mid-service. The open bill is the fact; the tile follows it.
    const floor = floorFrom([table({ status: 'free' })], HALLS, [order()], 'uz', NOW);

    expect(floor.tables[0]?.state).toBe('occupied');
  });

  it('reads the till’s own states into the four this app draws', () => {
    const billed = floorFrom([table({ status: 'to_pay' })], HALLS, [order()], 'uz', NOW);
    const unknown = floorFrom([table({ status: 'something_new' })], HALLS, [order()], 'uz', NOW);

    expect(billed.tables[0]?.state).toBe('awaiting-payment');
    // A state the server grows must leave the grid drawable rather than throw.
    expect(unknown.tables[0]?.state).toBe('occupied');
  });

  it('leaves a table taken out of service off the floor', () => {
    const floor = floorFrom([table({ is_active: false })], HALLS, [order()], 'uz', NOW);

    expect(floor.tables).toHaveLength(0);
  });

  it('names the rooms the restaurant named, not three fixed words', () => {
    /*
     * The fixtures say ZAL, VIP and KABINA because that is what is painted on
     * the doors of the venue the design was drawn in. A live floor has as many
     * halls as it has, named by itself — and a screen that iterated a fixed
     * list would silently drop the fourth one.
     */
    const floor = floorFrom(
      [table(), table({ id: 14, label: '14', hall: { id: 2 } })],
      HALLS,
      [order(), order({ id: 902, table: { id: 14, label: '14' } })],
      'uz',
      NOW,
    );

    expect(floor.zones.map((chip) => chip.label.uz)).toEqual(['Hammasi', 'ZAL', 'VIP']);
  });

  it('offers a room chip only where this waiter has a table', () => {
    // A chip for an empty room is a filter that answers "nothing" — worse than
    // absent, on a screen three chips wide.
    const floor = floorFrom([table()], HALLS, [order()], 'uz', NOW);

    expect(floor.zones).toHaveLength(2);
    expect(floor.zones[1]?.label.uz).toBe('ZAL');
  });

  it('treats a missing timestamp as zero rather than NaN', () => {
    const floor = floorFrom([table()], HALLS, [order({ placed_at: null })], 'uz', NOW);

    // `NaN` renders as "NaN daq" on a card somebody is reading mid-service.
    expect(floor.tables[0]?.minutes).toBe(0);
  });
});

describe('queueFrom — what a manager is being asked to sign', () => {
  function request(over: Record<string, unknown> = {}) {
    return {
      id: 41,
      action: 'discount',
      amount: 1_500_000,
      reason: 'Doimiy mijoz',
      status: 'pending',
      requested_by: { id: 8, name: 'Sardor' },
      requested_at: '2026-08-20T19:48:00Z',
      ...over,
    };
  }

  it('collapses the till’s six actions into the three a card shows', () => {
    const kinds = queueFrom(
      [
        request({ action: 'discount' }),
        request({ action: 'void_line' }),
        request({ action: 'void_order' }),
        request({ action: 'comp' }),
        request({ action: 'refund' }),
        request({ action: 'reopen_bill' }),
      ],
      NOW,
    ).map((item) => item.kind);

    /*
     * `comp` sits with the voids because it is the same act with a nicer name:
     * food that left the kitchen and was never paid for. `reopen_bill` sits
     * with the refunds because it is the one that reaches money already counted.
     */
    expect(kinds).toEqual(['discount', 'void', 'void', 'void', 'refund', 'refund']);
  });

  it('reads an action it has never seen as a void', () => {
    // The cautious default. A new till action shown as a discount would be
    // approved on the assumption that it takes a percentage off.
    expect(queueFrom([request({ action: 'something_new' })], NOW)[0]?.kind).toBe('void');
  });

  it('prices the request in whole so’m, in all three languages', () => {
    const item = queueFrom([request({ amount: 1_500_000 })], NOW)[0];

    /*
     * Built from the catalogue's own words rather than repeated here. A literal
     * would pass today and drift the first time somebody fixes an apostrophe —
     * which is exactly what it did on the first run of this test.
     */
    expect(item?.amount).toEqual({
      uz: `15 000 ${CURRENCY_WORD.uz}`,
      ru: `15 000 ${CURRENCY_WORD.ru}`,
      en: `15 000 ${CURRENCY_WORD.en}`,
    });
  });

  it('says how long it has been waiting', () => {
    // Twelve minutes with a guest standing at the till is a long time, and the
    // card is the only place a manager sees it.
    expect(queueFrom([request()], NOW)[0]?.ago).toEqual({
      uz: `12 ${MINUTE_WORD.uz}`,
      ru: `12 ${MINUTE_WORD.ru}`,
      en: `12 ${MINUTE_WORD.en}`,
    });
  });

  it('survives an approval with nothing filled in', () => {
    const item = queueFrom(
      [request({ amount: null, reason: null, requested_by: null, requested_at: null })],
      NOW,
    )[0];

    /*
     * The whole trilingual, not `.uz` — `Approval.amount` is `Trilingual |
     * string` because a fixture may carry a ready-made phrase, and reaching for
     * one language narrows a type the design deliberately left open.
     */
    expect(item?.amount).toEqual({
      uz: `0 ${CURRENCY_WORD.uz}`,
      ru: `0 ${CURRENCY_WORD.ru}`,
      en: `0 ${CURRENCY_WORD.en}`,
    });
    expect(item?.requester).toBe('');
    expect(item?.ago.uz).toBe(`0 ${MINUTE_WORD.uz}`);
  });
});

/**
 * `foundTablesFrom` — the search's half of the same join, with the opposite
 * rule about what to trust.
 *
 * `floorFrom` lets an open bill overrule a table row that still says `free`,
 * because a waiter looking at their own section has the bill in hand. The search
 * has no bill: it reads the label search and the hall list and nothing else, so
 * inventing "occupied" from a read it did not make would be a guess printed as a
 * state. These three cases pin that difference, plus the two things a wrong
 * mapping here costs — a room named as a number, and a table sent to somebody
 * that is no longer in the dining room.
 */
describe('foundTablesFrom — what the search box found', () => {
  it('names the room rather than its id', () => {
    const [found] = foundTablesFrom([table()], HALLS, 'uz');

    // `floorFrom` keys the zone by hall id because it draws filter chips off
    // it. There are no chips here, and a result reading "1" is worse than a
    // result with no room at all.
    expect(found.zone).toBe('ZAL');
  });

  it('leaves the room blank rather than guessing when the hall is unknown', () => {
    const [orphan] = foundTablesFrom([table({ hall: { id: 99 } })], HALLS, 'uz');
    const [loose] = foundTablesFrom([table({ hall: null })], HALLS, 'uz');

    expect(orphan.zone).toBe('');
    expect(loose.zone).toBe('');
  });

  it('drops a table that is out of service', () => {
    // Furniture in a store room. Offering it would send a waiter to a corner of
    // the restaurant where there is no table any more.
    expect(foundTablesFrom([table({ is_active: false })], HALLS, 'uz')).toEqual([]);
  });

  it('takes the row at its word, because there is no bill to overrule it', () => {
    const [free] = foundTablesFrom([table({ status: 'free' })], HALLS, 'uz');
    const [dirty] = foundTablesFrom([table({ status: 'dirty' })], HALLS, 'uz');
    const [booked] = foundTablesFrom([table({ status: 'booked' })], HALLS, 'uz');

    expect(free.state).toBe('free');
    // A table waiting to be cleared is one a waiter can seat next; the floor
    // ladder already folds `dirty` into `free` and the search says the same.
    expect(dirty.state).toBe('free');
    expect(booked.state).toBe('reserved');
  });
});
