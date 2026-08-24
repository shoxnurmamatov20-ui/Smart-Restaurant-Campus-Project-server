/**
 * The monthly target's step, and where it stops.
 *
 * Its own file rather than a constant inside `target-stepper.tsx`, because that
 * module is `'use client'` and a client module may export components and hooks
 * only (`lib/client-exports.test.ts` enforces it).
 */

/**
 * One million so'm, in tiyin.
 *
 * The granularity the design's figure prints in — `18M` — so a step that moved
 * anything smaller would leave the number on screen unchanged while the server
 * quietly stored a different one.
 */
export const STEP_TIYIN = 100_000_000;

/**
 * A ceiling, mirroring `config/settings.php`'s own `max` on this path.
 *
 * A stepper held down does not walk past what the API will accept — the
 * alternative is a refusal on the twentieth press with no way to tell which
 * press it was about.
 */
export const MAX_TIYIN = 100_000_000_000;

/**
 * The target after `by` steps, clamped at both ends.
 *
 * Floored at zero, which is what a venue with no target set looks like — and is
 * how a manager clears one they set by mistake. A negative target is not a
 * smaller ambition; it is a bug somebody would have to explain.
 */
export function steppedTarget(tiyin: number, by: number): number {
  return Math.min(MAX_TIYIN, Math.max(0, tiyin + by * STEP_TIYIN));
}
