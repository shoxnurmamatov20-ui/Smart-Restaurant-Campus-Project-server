import { describe, expect, it } from 'vitest';

import { stepOf, tableOrderFrom, type TableOrderPayload } from './live';

/**
 * The mapping between the server's thirteen states and the five a guest sees.
 *
 * Tested rather than trusted because this is the half that fails silently: a
 * fetch that breaks shows an error, and a mapping that breaks shows a guest a
 * confident, wrong answer about where their dinner is.
 *
 * The clock is a parameter throughout, so these assert exact minutes rather
 * than "about right" — the same rule `crew/live.ts` states, and the reason a
 * test of a time-dependent mapper can fail at all.
 */

const AT = new Date('2026-08-21T19:14:00');

function payload(over: Partial<TableOrderPayload> = {}): TableOrderPayload {
  return {
    number: 'A-0318',
    status: 'cooking',
    table: { label: 'A-7', seats: 4 },
    guests_count: 4,
    subtotal: 12_000_000,
    total: 13_440_000,
    lines: [
      { id: 11, title: 'Osh', quantity: 2, unit_price: 4_800_000, status: 'served' },
      { id: 12, title: 'Shashlik', quantity: 3, unit_price: 3_500_000, status: 'cooking' },
    ],
    ...over,
  };
}

describe('stepOf', () => {
  it('maps the five rungs a guest is shown', () => {
    expect(stepOf('placed')).toBe('sent');
    expect(stepOf('accepted')).toBe('accepted');
    expect(stepOf('cooking')).toBe('cooking');
    expect(stepOf('ready')).toBe('ready');
    expect(stepOf('served')).toBe('served');
  });

  it('treats a settled bill as food on the table', () => {
    // The guest ladder is about where the FOOD is. A bill waiting to be paid,
    // or paid, has its food in front of the guest.
    expect(stepOf('topay')).toBe('served');
    expect(stepOf('paid')).toBe('served');
  });

  it('gives the three no-food endings no rung at all', () => {
    /*
     * `voided`, `refunded` and `comped` are not places on a cooking ladder, and
     * drawing a comped bill at "served" would tell a guest their food is coming
     * when the restaurant has written the whole thing off.
     */
    expect(stepOf('voided')).toBeNull();
    expect(stepOf('refunded')).toBeNull();
    expect(stepOf('comped')).toBeNull();
    // And `draft`: a bill nobody has fired has not been sent.
    expect(stepOf('draft')).toBeNull();
    expect(stepOf(null)).toBeNull();
  });
});

describe('tableOrderFrom', () => {
  it('reads a bill into the shape the screens draw', () => {
    const order = tableOrderFrom(payload(), 'uz', 20, AT);

    expect(order).not.toBeNull();
    expect(order?.number).toBe('A-0318');
    expect(order?.table).toBe('A-7');
    expect(order?.guests).toBe(4);
    expect(order?.lines).toHaveLength(2);
    expect(order?.lines[0]?.price).toBe(4_800_000);
  });

  it('quotes the ETA as a wall clock the guest can plan around', () => {
    const order = tableOrderFrom(payload(), 'uz', 20, AT);

    expect(order?.etaMinutes).toBe(20);
    // 19:14 + 20 minutes, exactly. A "roughly right" assertion here would pass
    // for a mapper that added the minutes to the wrong instant.
    expect(order?.readyBy).toBe('19:34');
  });

  it('drops a voided line rather than drawing it', () => {
    // It stays on the bill for the audit trail, and it is food nobody is
    // cooking and nobody is charged for.
    const order = tableOrderFrom(
      payload({
        lines: [
          { id: 11, title: 'Osh', quantity: 1, unit_price: 4_800_000, status: 'served' },
          { id: 12, title: 'Choy', quantity: 1, unit_price: 800_000, status: 'cancelled' },
        ],
      }),
      'uz',
      20,
      AT,
    );

    expect(order?.lines).toHaveLength(1);
    expect(order?.lines[0]?.id).toBe('11');
  });

  it('lets the lines carry the ladder past the bill', () => {
    /*
     * The normal middle of a meal: the bill still reads `cooking` while the
     * starters are already on the table. Reading only the bill would tell a
     * guest nothing has been served when two plates are in front of them.
     */
    const order = tableOrderFrom(payload(), 'uz', 20, AT);

    expect(order?.reachedAt.served).not.toBeNull();
    expect(order?.reachedAt.sent).not.toBeNull();
  });

  it('marks earlier rungs reached without inventing a clock for them', () => {
    const order = tableOrderFrom(
      payload({
        status: 'cooking',
        lines: [{ id: 11, title: 'Osh', quantity: 1, unit_price: 4_800_000, status: 'cooking' }],
      }),
      'uz',
      20,
      AT,
    );

    // The rung the table is standing on gets the only honest clock — now.
    expect(order?.reachedAt.cooking).toBe('19:14');
    // The ones behind it are reached and timeless: the endpoint answers a bill
    // rather than a timeline, and a guessed time is worse than "pending".
    expect(order?.reachedAt.sent).toBe('');
    expect(order?.reachedAt.accepted).toBe('');
    // And the ones ahead are untouched.
    expect(order?.reachedAt.ready).toBeNull();
    expect(order?.reachedAt.served).toBeNull();
  });

  it('answers null for a body that is not a bill', () => {
    // Distinct from a table with nothing open, which the caller detects from a
    // clean response with a null `data`. An empty table is a state; a malformed
    // body is a fault, and a screen must not show "no order yet" for a server
    // that broke.
    expect(tableOrderFrom(null, 'uz', 20, AT)).toBeNull();
    expect(tableOrderFrom(undefined, 'uz', 20, AT)).toBeNull();
  });

  it('names no waiter, because the endpoint publishes none', () => {
    // Naming a member of staff to anybody who scans a sticker is a decision
    // nobody has made. The screens fall back to their own copy.
    expect(tableOrderFrom(payload(), 'uz', 20, AT)?.waiter).toBe('');
  });

  it('fills a plain title out to the three languages a screen reads', () => {
    // The API resolves jsonb `{uz,ru,en}` for the request's locale and answers a
    // string; a screen reads `name[locale]` and must not find undefined there.
    const order = tableOrderFrom(payload(), 'ru', 20, AT);

    expect(order?.lines[0]?.name).toEqual({ uz: 'Osh', ru: 'Osh', en: 'Osh' });
  });
});
