import { describe, expect, it } from 'vitest';

import { orderFrom, reachedIndex } from './live-order';

/**
 * The Telegram tracker drew order #4471 — en route, courier "A.T." — to
 * everyone who opened it. These are the rules that replaced it.
 */
describe('orderFrom', () => {
  const placed = {
    number: 'A-0042',
    status: 'cooking',
    total: 12_000_00,
    placed_at: '2026-08-22T11:02:00+05:00',
    accepted_at: '2026-08-22T11:03:00+05:00',
  };

  it('takes the one still on its way, not merely the newest', () => {
    const order = orderFrom([
      { number: 'A-0041', status: 'closed', closed_at: '2026-08-22T10:40:00+05:00' },
      placed,
    ]);

    expect(order?.number).toBe('#A-0042');
    expect(order?.state).toBe('cooking');
  });

  it('reads the clock off each step it has reached', () => {
    const order = orderFrom([
      { ...placed, status: 'ready', ready_at: '2026-08-22T11:19:00+05:00' },
    ]);

    expect(order?.times.accepted).toBe('11:03');
    expect(order?.times.ready).toBe('11:19');
    // Nothing invented for a step that has not happened.
    expect(order?.times.handed).toBeUndefined();
  });

  it('falls back to the last finished order when nothing is on the way', () => {
    const order = orderFrom([
      { number: 'A-0039', status: 'closed', closed_at: '2026-08-21T20:10:00+05:00' },
    ]);

    expect(order?.number).toBe('#A-0039');
    expect(order?.state).toBe('handed');
  });

  it('answers nothing for a guest who has never ordered', () => {
    expect(orderFrom([])).toBeNull();
    expect(orderFrom([{ status: 'cooking' }])).toBeNull();
  });

  it('places each state on the ladder the screen draws', () => {
    expect(reachedIndex('accepted')).toBe(0);
    expect(reachedIndex('handed')).toBe(4);
  });
});
