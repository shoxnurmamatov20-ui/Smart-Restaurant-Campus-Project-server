import { describe, expect, it } from 'vitest';

import { cashflowFrom, closedState, mixFrom } from './finance-server';

/**
 * The two mappings that decide what the finance screen may assert.
 *
 * Both replace a fixture that was drawn on the live path: the payment-mix donut
 * used to be the design's 44/29/16/11 split totalling 526M so'm on a restaurant
 * that had taken no payment at all, and the header used to state that a month
 * had been "closed and reconciled on 3 August" from the message catalogue.
 */
describe('mixFrom', () => {
  it('groups the month by tender, biggest first', () => {
    const mix = mixFrom([
      { source: 'payment', method: 'cash', amount: 30_000 },
      { source: 'payment', method: 'card', amount: 70_000 },
    ]);

    expect(mix?.map((slice) => [slice.key ?? slice.brand, slice.percent])).toEqual([
      ['payCard', 70],
      ['payCash', 30],
    ]);
  });

  it('names a tender the catalogue has no word for by its own brand', () => {
    const mix = mixFrom([{ source: 'payment', method: 'payme', amount: 500 }]);

    expect(mix?.[0]).toMatchObject({ key: null, brand: 'Payme', percent: 100 });
  });

  it('counts takings only — a cash drop to the bank is not a payment mix', () => {
    const mix = mixFrom([
      { source: 'payment', method: 'cash', amount: 1_000 },
      { source: 'expense', method: 'cash', amount: 900 },
      // A reversal leaves the drawer; counting it would inflate the cash share.
      { source: 'payment', method: 'cash', amount: -400 },
    ]);

    expect(mix).toEqual([{ key: 'payCash', amount: 1_000, percent: 100 }]);
  });

  it('answers null for a month that took nothing, so the panel can be dropped', () => {
    expect(mixFrom([])).toBeNull();
    expect(mixFrom([{ source: 'expense', method: 'cash', amount: 900 }])).toBeNull();
  });

  it('answers null when the cash book did not answer at all', () => {
    expect(mixFrom(undefined)).toBeNull();
  });
});

describe('closedState', () => {
  it('reports the drawn month, not the newest one', () => {
    const periods = [
      { period: '2026-08', status: 'open' },
      { period: '2026-07', status: 'closed' },
    ];

    expect(closedState(periods, '2026-07')).toBe(true);
    expect(closedState(periods, '2026-08')).toBe(false);
  });

  it('separates "not closed" from "nobody knows"', () => {
    // A month the register does not carry is not an open month, and the header
    // must not claim either way.
    expect(closedState([], '2026-07')).toBeNull();
    expect(closedState(undefined, '2026-07')).toBeNull();
  });
});

describe('cashflowFrom', () => {
  it('labels each bar with its own month, in the reader’s language', () => {
    const bars = cashflowFrom(
      [
        { month: '2026-07', in_tiyin: 900, out_tiyin: 400, net_tiyin: 500 },
        { month: '2026-08', in_tiyin: 300, out_tiyin: 100, net_tiyin: 200 },
      ],
      'ru',
    );

    expect(bars?.map((bar) => bar.label)).toEqual(['Июл', 'Авг']);
    expect(bars?.[0]).toMatchObject({ month: '2026-07', in: 900, out: 400 });
  });

  it('keeps an empty month in the series so the bars stay in order', () => {
    const bars = cashflowFrom(
      [
        { month: '2026-06', in_tiyin: 0, out_tiyin: 0, net_tiyin: 0 },
        { month: '2026-07', in_tiyin: 500, out_tiyin: 0, net_tiyin: 500 },
      ],
      'uz',
    );

    // Dropping the quiet month would put July where June was, and a reader
    // comparing this quarter against the last would be reading a shifted chart.
    expect(bars).toHaveLength(2);
    expect(bars?.[0].label).toBe('Iyn');
  });

  it('answers null for six months in which nothing moved', () => {
    // A chart of six zero-height bars claims a restaurant took nothing since
    // spring. The panel is dropped instead.
    expect(
      cashflowFrom([{ month: '2026-08', in_tiyin: 0, out_tiyin: 0, net_tiyin: 0 }], 'uz'),
    ).toBeNull();
  });

  it('answers null when the series did not arrive at all', () => {
    expect(cashflowFrom(undefined, 'uz')).toBeNull();
    expect(cashflowFrom([], 'uz')).toBeNull();
  });
});
