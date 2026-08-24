import { describe, expect, it } from 'vitest';

import { openingHoursFrom } from './web-data';

/**
 * The card drew ten-to-eleven, seven days, Tuesday marked as today — to every
 * restaurant, including one that shuts on Mondays.
 */
describe('openingHoursFrom', () => {
  // A Wednesday.
  const now = new Date(2026, 7, 19, 12, 0, 0);

  it('reads the venue’s own week', () => {
    const rows = openingHoursFrom(
      { mon: ['11:00', '22:00'], wed: ['10:00', '23:30'] },
      now,
      'Yopiq',
    );

    expect(rows[0]?.hours).toBe('11:00 – 22:00');
    expect(rows[2]?.hours).toBe('10:00 – 23:30');
  });

  it('says a day is shut rather than leaving it blank', () => {
    const rows = openingHoursFrom({ wed: ['10:00', '23:00'] }, now, 'Yopiq');

    expect(rows[0]?.hours).toBe('Yopiq');
  });

  it('marks today from the clock, not from the data', () => {
    const rows = openingHoursFrom({}, now, 'Yopiq');

    // Wednesday is the third row, Monday-first.
    expect(rows.map((row) => row.today)).toEqual([false, false, true, false, false, false, false]);
  });

  it('is a full week even when the venue has published nothing', () => {
    expect(openingHoursFrom(null, now, 'Yopiq')).toHaveLength(7);
  });
});
