import type { Kpi } from './overview-data';

/**
 * Gross margin, from the cards themselves.
 *
 * The gross-profit card's caption used to be the catalogue string
 * "61.1% marja" — which is the fixture's own 11 260 000 over 18 420 000,
 * written down as copy and then shown beside every live figure as if it were
 * a measurement. The ratio is computed here instead: the fixture still reads
 * 61.1, and a live week reads what it earned. One decimal, like the design;
 * `null` when either side is unknown or there was no revenue to divide by —
 * a margin of a zero day is not 0%, it is nothing.
 */
export function marginOf(kpis: readonly Kpi[]): number | null {
  const revenue = kpis.find((kpi) => kpi.key === 'revenue')?.value ?? null;
  const gross = kpis.find((kpi) => kpi.key === 'gross_profit')?.value ?? null;

  if (revenue === null || gross === null || revenue <= 0) return null;

  return Math.round((gross / revenue) * 1000) / 10;
}
