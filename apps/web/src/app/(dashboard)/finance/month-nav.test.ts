import { describe, expect, it } from 'vitest';

import { askedMonth, shiftMonth } from './month-nav';

/**
 * The month arithmetic behind the finance screen's picker.
 *
 * Worth its own file because the obvious implementation — `new Date(month)` —
 * is wrong in a way nobody notices in Tashkent and everybody notices in London:
 * `'2026-03'` parses as UTC midnight, so west of Greenwich it is already
 * February and every step skips a month.
 */
describe('shiftMonth', () => {
  it('steps within a year', () => {
    expect(shiftMonth('2026-07', 1)).toBe('2026-08');
    expect(shiftMonth('2026-07', -1)).toBe('2026-06');
  });

  it('steps over both ends of a year', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('steps more than a year at a time', () => {
    expect(shiftMonth('2026-05', -14)).toBe('2025-03');
    expect(shiftMonth('2026-05', 20)).toBe('2028-01');
  });

  it('keeps the two-digit month, because the string is compared as a string', () => {
    // `'2026-9' > '2026-10'` is true and would let the picker walk past the
    // current month.
    expect(shiftMonth('2026-08', 1)).toBe('2026-09');
  });
});

describe('askedMonth', () => {
  it('takes a well-formed month from the URL', () => {
    expect(askedMonth('2026-05', '2026-07', '2026-08')).toBe('2026-05');
  });

  it('falls back rather than 422-ing on a stale bookmark', () => {
    expect(askedMonth('july', '2026-07', '2026-08')).toBe('2026-07');
    expect(askedMonth('2026-13', '2026-07', '2026-08')).toBe('2026-07');
    expect(askedMonth(undefined, '2026-07', '2026-08')).toBe('2026-07');
  });

  it('refuses a month that has not happened yet', () => {
    // An empty sheet under a confident heading is worse than the default.
    expect(askedMonth('2027-01', '2026-07', '2026-08')).toBe('2026-07');
    // The running month is allowed: a reader in the third week wants it.
    expect(askedMonth('2026-08', '2026-07', '2026-08')).toBe('2026-08');
  });
});
