/**
 * How a live dashboard draws a figure it does not have, and a rail nobody set.
 *
 * Two rules, both learned the same way — a real restaurant signed in on its
 * first day and read the demo restaurant's takings:
 *
 *  1. **`null` is a dash, never a number.** The server sends `null` when it
 *     cannot answer honestly (`RoleDashboards::averageWaitMinutes()` on a venue
 *     that has served nobody, `netMargin()` before a single recipe is costed).
 *     Substituting the fixture's figure turns "I cannot say" into a claim, and
 *     an invented money figure on a KPI card carries no marker saying so.
 *  2. **A rail needs a target somebody set.** There are no targets in the API —
 *     `overview-server.ts` says exactly that and passes `attainment: null` for
 *     the owner, which `KpiCard` renders as no rail and no caption. Every other
 *     role divided by a constant out of the design (18 open tickets, 260
 *     covers, a 620m monthly plan), so a live venue was scored red or green
 *     against somebody else's business plan.
 *
 * The fixture console keeps both — its numbers ARE the design's, the shell's
 * banner says so, and the rails are part of the drawing being demonstrated.
 * That is what `live` decides here: not whether to fetch, but whether the
 * screen is allowed to keep the design's arithmetic.
 */

/** What the design prints where a figure is not available. U+2014. */
export const DASH = '—';

/** A figure, or the dash. `format` is the caller's — it knows the locale. */
export function show(value: number | null, format: (value: number) => string): string {
  return value === null ? DASH : format(value);
}

/**
 * Attainment against a target, or `null` for no rail at all.
 *
 * Null on a live tenant whatever the numbers are: the target is the part that
 * is missing, not the figure. A zero or negative target is also null rather
 * than an infinity — a rail is a ratio and a ratio needs a denominator.
 */
export function rail(live: boolean, value: number | null, target: number): number | null {
  if (live || value === null || target <= 0) return null;

  return (value / target) * 100;
}

/**
 * A delta chip, or nothing.
 *
 * The chips on these screens were component literals — `+9.2%`, `−0:07`,
 * `+0.3` — the same on every tenant on every day. A live screen shows a delta
 * only where the server measured one; there is nothing here to compute from.
 */
export function delta(live: boolean, text: string): string | undefined {
  return live ? undefined : text;
}

/**
 * The biggest row on a list, as a divisor that is never `-Infinity`.
 *
 * `Math.max(...[])` is `-Infinity`, and four panels sized their bars with it —
 * which is the whole reason those four fell back to the fixture on an EMPTY
 * live answer rather than on a missing one. Seeding with zero is the one-line
 * fix that lets an empty leaderboard through; `shareOf` guards the division.
 */
export function peakOf(values: readonly number[]): number {
  return Math.max(0, ...values);
}
