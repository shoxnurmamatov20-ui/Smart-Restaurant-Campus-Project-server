import { describe, expect, it } from 'vitest';

import { reportKindFrom, reportPeriodFrom, sheetFrom } from './report-server';

/**
 * The sheet behind the export dialog's PDF button.
 *
 * Fetching is a pipe; the mapping is the part where a mistake is invisible.
 * Every assertion below is about a figure or a heading that would be wrong on
 * paper and look perfectly ordinary — a total under the wrong column, an amount
 * a hundred times too large because tiyin were printed as so'm, a report headed
 * with a window it does not cover.
 *
 * Money is integer tiyin throughout, and the dates are asserted exactly: the
 * window printed on a report is what decides which days it is about.
 */
function report(over: Record<string, unknown> = {}) {
  return {
    kind: 'dishes',
    window: { from: '2026-07-23', to: '2026-08-21', period: 'month' },
    available: true,
    columns: [
      { key: 'title', type: 'text' },
      { key: 'sold', type: 'count' },
      { key: 'revenue_tiyin', type: 'money' },
      { key: 'margin_percent', type: 'percent' },
    ],
    rows: [
      { title: 'Osh', sold: 412, revenue_tiyin: 45_000_000, margin_percent: 62 },
      { title: 'Lag‘mon', sold: 118, revenue_tiyin: 9_440_000, margin_percent: null },
    ],
    totals: { sold: 530, revenue_tiyin: 54_440_000 },
    ...over,
  } as Parameters<typeof sheetFrom>[1];
}

describe('sheetFrom', () => {
  it('heads the sheet with the report’s name and the window the API used', () => {
    /*
     * "Oylik" is a button; `23.07.2026 — 21.08.2026` is what the figures are
     * about. The name comes from the console's own card, so the paper and the
     * screen cannot call the same report two different things.
     */
    const sheet = sheetFrom('dishes', report());

    expect(sheet?.title).toBe("Taomlar bo'yicha hisobot");
    expect(sheet?.window).toBe('23.07.2026 — 21.08.2026');
  });

  it('reconciles the API’s fifth name with the viewer’s own', () => {
    // The design's card is `cash`, the API's report is `cashflow`. A sheet
    // headed with the raw key is a report nobody asked for by that name.
    expect(sheetFrom('cashflow', report({ kind: 'cashflow' }))?.title).toBe('Pul oqimi hisoboti');
  });

  it('prints money in so’m from integer tiyin, and never as a raw figure', () => {
    /*
     * `45 000 000` tiyin is `450 000` so'm. Printing the wire figure would be a
     * hundredfold amount on a sheet somebody signs — the failure
     * `formatTiyinAmount` exists to make impossible.
     *
     * The grouping character is U+00A0, spelled out here rather than typed:
     * an ordinary space in this file would make the assertion pass or fail on
     * something invisible to whoever next edits it.
     */
    const sheet = sheetFrom('dishes', report());

    expect(sheet?.rows[0]?.[2]).toBe('450\u00a0000');
    expect(sheet?.rows[1]?.[2]).toBe('94\u00a0400');
  });

  it('prints a dash where a figure could not be computed', () => {
    // Not a zero: a margin that could not be computed is not a margin of
    // nothing, and a column of zeros invites an average that means nothing.
    expect(sheetFrom('dishes', report())?.rows[1]?.[3]).toBe('—');
  });

  it('names the columns in Uzbek, like every other word on this surface', () => {
    const sheet = sheetFrom('dishes', report());

    expect(sheet?.columns.map((column) => column.label)).toEqual([
      'Taom',
      'Sotildi',
      'Summa',
      'Marja',
    ]);
  });

  it('lines figures up on the right and text on the left', () => {
    expect(sheetFrom('dishes', report())?.columns.map((column) => column.numeric)).toEqual([
      false,
      true,
      true,
      true,
    ]);
  });

  it('puts every total under its own column and leaves the rest blank', () => {
    /*
     * The row is positional, so a total placed one cell out is a margin printed
     * under "Summa" — a wrong number in the one place on the sheet a reader
     * takes on trust.
     */
    expect(sheetFrom('dishes', report())?.totals).toEqual(['JAMI', '530', '544\u00a0400', '']);
  });

  it('draws no footer where there is nothing to add up', () => {
    // A row of dashes under a list of voids and their reasons reads as a total
    // somebody failed to compute.
    expect(sheetFrom('voids', report({ totals: {} }))?.totals).toBeNull();
  });

  it('refuses to print a report the module behind it cannot answer', () => {
    /*
     * `stock` needs Inventory and Analytics may read Menu, Orders and Finance
     * only, so the API says `available: false`. An empty table under a real
     * heading and a real date range would read as "nothing was sold".
     */
    expect(sheetFrom('stock', report({ available: false, reason: 'inventory' }))).toBeNull();
    expect(sheetFrom('stock', report({ columns: [] }))).toBeNull();
  });
});

describe('reportKindFrom and reportPeriodFrom', () => {
  it('takes the five kinds and the three windows, and nothing else', () => {
    expect(reportKindFrom('cashflow')).toBe('cashflow');
    expect(reportKindFrom(['dishes', 'voids'])).toBe('dishes');
    expect(reportPeriodFrom('week')).toBe('week');
  });

  it('answers null rather than falling back to a report nobody asked for', () => {
    /*
     * `?kind=` is in the address bar of a page that prints a restaurant's
     * takings. A value it cannot read has to become "no report" — defaulting to
     * the first one would print a page headed with figures the reader never
     * requested, which looks right and is not.
     */
    expect(reportKindFrom(undefined)).toBeNull();
    expect(reportKindFrom('')).toBeNull();
    expect(reportKindFrom('cash')).toBeNull();
    expect(reportKindFrom('../../settings')).toBeNull();
    expect(reportPeriodFrom('quarter')).toBeNull();
    expect(reportPeriodFrom(undefined)).toBeNull();
  });
});
