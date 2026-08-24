/**
 * Walking a `YYYY-MM` back and forth, and deciding what may be asked for.
 *
 * Its own file rather than a helper inside `month-picker.tsx`, because that
 * module is `'use client'` and a client module may export components and hooks
 * only (`lib/client-exports.test.ts` enforces it) — and because arithmetic on a
 * month is exactly the thing worth having a test for.
 */

/**
 * `YYYY-MM` moved by whole months.
 *
 * String arithmetic rather than a `Date`, and that is not fussiness:
 * `new Date('2026-03')` is parsed as UTC midnight, so for every reader west of
 * Greenwich it is already February — and a picker built on it skips a month for
 * half the world, on a screen whose whole subject is which month is being read.
 */
export function shiftMonth(month: string, by: number): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1 + by;

  const carried = year + Math.floor(index / 12);
  // The remainder in PHP and JS is signed, so December of the previous year
  // comes out of `-1` as `-1` rather than as `11`. The double modulo is what
  // makes stepping backwards over a new year land on December.
  const settled = ((index % 12) + 12) % 12;

  return `${carried}-${String(settled + 1).padStart(2, '0')}`;
}

/**
 * The month a request is allowed to draw.
 *
 * Anything that is not `YYYY-MM`, and anything after the newest month, falls
 * back to the default. A stale bookmark should draw a statement rather than a
 * validation error, and a request for next March would otherwise render an
 * empty sheet under a confident heading.
 */
export function askedMonth(asked: string | undefined, fallback: string, latest: string): string {
  if (asked === undefined || !/^\d{4}-(0[1-9]|1[0-2])$/.test(asked)) return fallback;

  return asked > latest ? fallback : asked;
}
