import { describe, expect, it, vi } from 'vitest';

/*
 * `vi.hoisted` because `vi.mock` is lifted above the imports: a plain
 * `const apiGet = vi.fn()` would still be in its temporal dead zone when the
 * factory runs.
 */
const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('@/lib/api-server', () => ({
  apiGet,
  translate: (value: unknown, locale: string) =>
    typeof value === 'string' ? value : ((value as Record<string, string>)[locale] ?? ''),
}));

import { getSiteDishes, getSiteTraffic } from './web-server';
import {
  bandFrom,
  DEFAULT_COVERS,
  DEFAULT_SLOT_MINUTES,
  DEMO_BOOKING_GRID,
  hoursOn,
  type BookingDay,
} from './web-data';
import {
  getBookingGrid,
  gridFrom,
  hoursOfWindow,
  minutesOf,
  venueFrom,
  weekFrom,
  type ApiBookingWindow,
} from './web-server';

/**
 * Turning spans into hours, which is the half of this screen nobody can see is
 * wrong.
 *
 * Everything else on the bookings tab announces itself when it breaks — a
 * missing weekday, a tile that will not move. This does not: an hour dropped
 * off the end of a span is drawn as a closed tile, looks exactly like a
 * deliberate one, and the first person to touch that weekday writes the
 * mistake back as a row the venue never meant. A restaurant would find out from
 * an empty dining room.
 *
 * Two rules carry all of it and both come from the model rather than from taste:
 * the last sitting STARTS before `closes_at`, and a window that closes before it
 * opens runs past midnight.
 */
function window(over: Partial<ApiBookingWindow> = {}): ApiBookingWindow {
  return {
    id: 12,
    branch_id: 1,
    weekday: 5,
    opens_at: '18:00',
    closes_at: '23:00',
    slot_minutes: 30,
    capacity: 40,
    is_active: true,
    ...over,
  };
}

describe('minutesOf', () => {
  it('reads a wall clock', () => {
    expect(minutesOf('18:30')).toBe(1110);
    expect(minutesOf('00:00')).toBe(0);
    // The column sends `18:00:00` from some drivers; the payload trims it.
    expect(minutesOf('18:00:00')).toBe(1080);
  });

  it('refuses anything that is not one, rather than calling it midnight', () => {
    // Zero would move a whole evening's window to the top of the grid, and
    // nothing on the screen would look wrong.
    expect(minutesOf('')).toBeNull();
    expect(minutesOf('evening')).toBeNull();
    expect(minutesOf('26:00')).toBeNull();
    expect(minutesOf('18:75')).toBeNull();
  });
});

describe('hoursOfWindow', () => {
  it('stops before the closing hour, because the last sitting starts before it', () => {
    // A restaurant closing at 23:00 seats a table at 22:30 and has no 23:00
    // sitting. Drawing 23:00 as bookable would offer an hour the site refuses.
    expect(hoursOfWindow(window({ opens_at: '18:00', closes_at: '23:00' }))).toEqual([
      18, 19, 20, 21, 22,
    ]);
  });

  it('keeps the closing hour when a sitting can still start inside it', () => {
    expect(hoursOfWindow(window({ opens_at: '18:00', closes_at: '23:30' }))).toEqual([
      18, 19, 20, 21, 22, 23,
    ]);
  });

  it('counts the hour a window opens in even when it opens on the half', () => {
    expect(hoursOfWindow(window({ opens_at: '18:30', closes_at: '21:00' }))).toEqual([18, 19, 20]);
  });

  it('runs past midnight when it closes before it opens', () => {
    /*
     * A bar's Friday. `BookingWindow::slotsOn()` adds a day to the closing edge
     * for exactly this, and without it the loop produces nothing — the venue
     * silently stops taking bookings on its busiest night.
     */
    expect(hoursOfWindow(window({ opens_at: '18:00', closes_at: '01:00' }))).toEqual([
      18, 19, 20, 21, 22, 23, 0,
    ]);
  });

  it('reads an equal pair as a venue that books around the clock', () => {
    expect(hoursOfWindow(window({ opens_at: '00:00', closes_at: '00:00' }))).toHaveLength(24);
  });

  it('reads midnight as a closing edge, not as an empty window', () => {
    expect(hoursOfWindow(window({ opens_at: '20:00', closes_at: '00:00' }))).toEqual([
      20, 21, 22, 23,
    ]);
  });

  it('gives nothing for a span it could not read', () => {
    expect(hoursOfWindow(window({ opens_at: 'noon', closes_at: '23:00' }))).toEqual([]);
  });
});

describe('weekFrom', () => {
  it('always draws seven rows, Monday first', () => {
    const week = weekFrom([]);

    expect(week.map((day) => day.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(week.every((day) => day.open.length === 0)).toBe(true);
  });

  it('puts a split service on one weekday as two runs of hours', () => {
    const week = weekFrom([
      window({ id: 1, weekday: 5, opens_at: '12:00', closes_at: '15:00', capacity: 20 }),
      window({ id: 2, weekday: 5, opens_at: '18:00', closes_at: '23:00', capacity: 40 }),
    ]);

    const friday = week[4]!;

    expect(friday.open.map((slot) => slot.hour)).toEqual([12, 13, 14, 18, 19, 20, 21, 22]);
    // Capacity travels per hour, not per weekday: one number for the day would
    // print the dinner ceiling over lunch.
    expect(friday.open.find((slot) => slot.hour === 12)?.capacity).toBe(20);
    expect(friday.open.find((slot) => slot.hour === 20)?.capacity).toBe(40);
  });

  it('leaves a switched-off window closed', () => {
    // `BookingDiary` reads through `active()`, so an inactive row offers a guest
    // nothing. An open tile here would advertise an evening the site refuses.
    const week = weekFrom([window({ weekday: 3, is_active: false })]);

    expect(week[2]?.open).toEqual([]);
  });

  it('lets the later window win an hour two of them claim', () => {
    /*
     * The same rule `BookingDiary::slotsOn()` states — slots keyed by the
     * instant, the later window wins — because a different capacity here than
     * the site offers would make this screen a second opinion about somebody's
     * Friday.
     */
    const week = weekFrom([
      window({ id: 2, weekday: 1, opens_at: '19:00', closes_at: '22:00', capacity: 10 }),
      window({ id: 1, weekday: 1, opens_at: '18:00', closes_at: '21:00', capacity: 40 }),
    ]);

    expect(week[0]?.open.find((slot) => slot.hour === 20)?.capacity).toBe(10);
    expect(week[0]?.open.find((slot) => slot.hour === 18)?.capacity).toBe(40);
  });

  it('files a window that runs past midnight under the night it belongs to', () => {
    const week = weekFrom([window({ weekday: 5, opens_at: '22:00', closes_at: '02:00' })]);

    expect(week[4]?.open.map((slot) => slot.hour)).toEqual([0, 1, 22, 23]);
    // And not on Saturday, which is a different night and has its own row.
    expect(week[5]?.open).toEqual([]);
  });

  it('ignores a weekday outside the ISO range rather than drawing an eighth row', () => {
    expect(weekFrom([window({ weekday: 0 }), window({ weekday: 8 })])).toHaveLength(7);
  });

  it('never paints an open hour with the full tint', () => {
    // `capacity` is unsigned in the column; a negative arriving here would read
    // as zero, which on this grid means "open, and full".
    const week = weekFrom([window({ weekday: 2, capacity: -4 })]);

    expect(week[1]?.open[0]?.capacity).toBe(0);
  });
});

describe('venueFrom', () => {
  it('names the venue when every row is one venue’s', () => {
    expect(venueFrom([window({ branch_id: 3 }), window({ branch_id: 3, weekday: 6 })])).toBe(3);
  });

  it('names none when the answer spans an estate', () => {
    // An owner is pinned to no venue and sees all of them. Guessing would draw
    // a mall unit's hours over a terrace's.
    expect(venueFrom([window({ branch_id: 1 }), window({ branch_id: 2 })])).toBeNull();
  });

  it('names none when there is nothing to tell it from', () => {
    expect(venueFrom([])).toBeNull();
  });
});

describe('getBookingGrid', () => {
  it('draws the venue’s own week when the API answers', async () => {
    apiGet.mockResolvedValueOnce({ data: [window({ weekday: 1, branch_id: 4 })] });

    const grid = await getBookingGrid();

    expect(grid.live).toBe(true);
    expect(grid.branchId).toBe(4);
    expect(grid.days[0]?.open.map((slot) => slot.hour)).toEqual([18, 19, 20, 21, 22]);
  });

  it('treats an empty list as a real answer, not as a reason to draw the sample', async () => {
    /*
     * The commonest state on the platform: booking windows are a feature a
     * restaurant switches on by filling them in. Drawing the sample over it
     * would tell a manager they had configured a diary they have not — and the
     * first click would then delete hours nobody ever set.
     */
    apiGet.mockResolvedValueOnce({ data: [] });

    const grid = await getBookingGrid();

    expect(grid.live).toBe(true);
    expect(grid.days.every((day) => day.open.length === 0)).toBe(true);
  });

  it('falls back to the design’s week when there is no session', async () => {
    apiGet.mockResolvedValueOnce(null);

    const grid = await getBookingGrid();

    expect(grid).toBe(DEMO_BOOKING_GRID);
    expect(grid.live).toBe(false);
    // And it carries no venue, so the panel has nothing to write against.
    expect(grid.branchId).toBeNull();
  });

  it('asks the endpoint by name, without doubling the /v1 prefix', async () => {
    apiGet.mockResolvedValueOnce({ data: [] });

    await getBookingGrid();

    expect(apiGet).toHaveBeenLastCalledWith('/tables/booking-windows');
  });
});

describe('gridFrom', () => {
  it('is live by definition — it is only reached when the API answered', () => {
    expect(gridFrom([]).live).toBe(true);
  });
});

describe('bandFrom', () => {
  const day = (weekday: number, hours: number[]): BookingDay => ({
    weekday: weekday as BookingDay['weekday'],
    open: hours.map((hour) => ({ hour, capacity: 20, slotMinutes: 30 })),
  });

  it('leaves an hour of margin on each side, so service can be extended', () => {
    expect(bandFrom([day(1, [12, 13, 14])])).toEqual([11, 12, 13, 14, 15]);
  });

  it('spans every weekday, not just the busiest one', () => {
    expect(bandFrom([day(1, [12]), day(6, [22])])).toEqual([
      11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    ]);
  });

  it('does not run off either end of the clock', () => {
    expect(bandFrom([day(5, [0, 23])])).toEqual(Array.from({ length: 24 }, (_, hour) => hour));
  });

  it('opens on the design’s own band when the week is empty', () => {
    // A venue with no windows still needs somewhere to press.
    expect(bandFrom([day(1, [])])).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    ]);
  });
});

describe('hoursOn', () => {
  const friday: BookingDay = {
    weekday: 5,
    open: [
      { hour: 18, capacity: 40, slotMinutes: 60 },
      { hour: 19, capacity: 40, slotMinutes: 60 },
    ],
  };

  it('keeps what an hour already offers', () => {
    expect(hoursOn(friday, [18, 19])).toEqual(friday.open);
  });

  it('borrows from the nearest neighbour when an hour is opened', () => {
    // The same direction the write inherits in: a span split out of a
    // forty-cover evening stays a forty-cover evening.
    expect(hoursOn(friday, [18, 19, 20])[2]).toEqual({
      hour: 20,
      capacity: 40,
      slotMinutes: 60,
    });
  });

  it('falls back to the column’s defaults when there is no neighbour at all', () => {
    expect(hoursOn({ weekday: 2, open: [] }, [12])).toEqual([
      { hour: 12, capacity: DEFAULT_COVERS, slotMinutes: DEFAULT_SLOT_MINUTES },
    ]);
  });

  it('sorts and dedupes, whatever order the hours arrived in', () => {
    expect(hoursOn(friday, [19, 18, 19]).map((slot) => slot.hour)).toEqual([18, 19]);
  });

  it('drops an hour that is no longer wanted', () => {
    expect(hoursOn(friday, [19]).map((slot) => slot.hour)).toEqual([19]);
  });
});

describe('getSiteTraffic', () => {
  it('is not live when nothing has been counted here', async () => {
    apiGet.mockResolvedValueOnce(null);

    const traffic = await getSiteTraffic();

    // "We have not connected this" and "nobody came" are different sentences,
    // and the tab draws a different one for each.
    expect(traffic.live).toBe(false);
    expect(traffic.visits).toBe(0);
  });

  it('is live with zeroes for a site nobody visited this week', async () => {
    apiGet.mockResolvedValueOnce({
      data: { series: [{ day: '2026-08-22', visits: 0 }], pages: [] },
      meta: { visits: 0, previous_visits: 0 },
    });

    const traffic = await getSiteTraffic();

    expect(traffic.live).toBe(true);
    expect(traffic.visits).toBe(0);
    expect(traffic.series).toHaveLength(1);
  });
});

describe('getSiteDishes', () => {
  it('answers null when the menu did not come back', async () => {
    apiGet.mockResolvedValueOnce(null).mockResolvedValueOnce({ data: [] });

    await expect(getSiteDishes('uz')).resolves.toBeNull();
  });

  it('reads a description in the READER’s language, not any language', async () => {
    apiGet
      .mockResolvedValueOnce({
        data: [
          {
            id: 4,
            name: { uz: 'Osh', ru: 'Плов', en: 'Pilaf' },
            price: 45_000_00,
            description: { uz: '', ru: '', en: 'Rice, beef and carrot' },
            image_url: null,
            is_available: true,
            category: { id: 2 },
          },
        ],
      })
      .mockResolvedValueOnce({ data: [{ id: 2, name: { uz: 'Milliy taomlar' } }] });

    const dishes = await getSiteDishes('uz');

    // A dish described only in English is undescribed to an Uzbek visitor, and
    // this list is the one that says what still needs writing.
    expect(dishes?.[0]).toMatchObject({
      name: 'Osh',
      categoryName: 'Milliy taomlar',
      photo: false,
      described: false,
    });
  });
});
