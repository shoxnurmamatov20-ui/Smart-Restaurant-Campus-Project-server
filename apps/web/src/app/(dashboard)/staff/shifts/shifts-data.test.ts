import { describe, expect, it } from 'vitest';

import { weekLabel } from './shifts-data';

/**
 * The caption over the rota grid.
 *
 * `console.shifts.rotaSub` held "11–17 avgust" as a literal above a grid whose
 * week is computed from today, so the two agreed in exactly one week of 2026
 * and disagreed in every other — and a manager reading the caption schedules
 * against the wrong dates.
 */
describe('weekLabel', () => {
  it('names the month once when the week does not cross one', () => {
    // The reader's own order: Uzbek puts the month last, English first, and
    // hand-joining two formats produced "10–August 16" for one of them.
    expect(weekLabel({ from: '2026-08-10', to: '2026-08-16' }, 'uz-UZ')).toContain('avgust');
    expect(
      weekLabel({ from: '2026-08-10', to: '2026-08-16' }, 'uz-UZ').match(/avgust/g),
    ).toHaveLength(1);
  });

  it('names both months when the week does cross one', () => {
    const label = weekLabel({ from: '2026-08-31', to: '2026-09-06' }, 'uz-UZ');

    expect(label).toContain('avgust');
    expect(label).toContain('sentabr');
  });

  it('reads the dates as local days rather than as UTC instants', () => {
    /*
     * `new Date('2026-08-10')` is midnight UTC, which is the ninth in any
     * timezone west of Greenwich — a caption a day out for half the world.
     * The `T00:00:00` suffix is what keeps it the day it says.
     */
    expect(weekLabel({ from: '2026-08-10', to: '2026-08-10' }, 'en')).toBe('August 10');
  });
});
