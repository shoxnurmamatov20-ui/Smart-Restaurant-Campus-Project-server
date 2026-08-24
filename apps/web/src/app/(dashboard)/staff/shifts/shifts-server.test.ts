import { describe, expect, it, vi } from 'vitest';

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('@/lib/api-server', () => ({ apiGet }));

import { getOpeningChecklist, getSwappableShifts } from './shifts-server';
import { getBookings } from './shifts-server';

/**
 * Tonight's diary, from the diary.
 *
 * The panel that draws this used to build its rows from `BOOKINGS` with no
 * fetch at all — "Rustam aka · 6 kishi · Stol 14 · tug'ilgan kun" — and the
 * floor screen's "Reservations" button routes the host straight to it. So a
 * restaurant with nothing booked was handed a plan for somebody else's evening.
 *
 * Two rules are worth holding. A booking already seated is not in the diary:
 * the diary is what is still to come, and the floor plan owns the rest. And a
 * booking with no table must not claim one — `pending` means no table is held,
 * and a line reading "Stol —" would be a host walking to a table nobody kept.
 */
const words = { guests: 'mehmon', table: 'Stol' };

function booking(over: Record<string, unknown> = {}) {
  return {
    id: 9,
    guest_name: 'Rustam',
    guest_phone: '+998901234567',
    guests_count: 6,
    starts_at: '2026-08-22T18:00:00+05:00',
    status: 'confirmed',
    note: null,
    table: { id: 3, label: '14' },
    ...over,
  };
}

const day = new Date('2026-08-22T12:00:00+05:00');

describe('getBookings', () => {
  it('answers null when the API did not, so the panel keeps its fixture', async () => {
    apiGet.mockResolvedValueOnce(null);

    await expect(getBookings(words, day)).resolves.toBeNull();
  });

  it('answers an empty diary as empty', async () => {
    apiGet.mockResolvedValueOnce({ data: [] });

    await expect(getBookings(words, day)).resolves.toEqual([]);
  });

  it('asks for today in the room’s own day', async () => {
    apiGet.mockResolvedValueOnce({ data: [] });

    await getBookings(words, day);

    expect(apiGet).toHaveBeenLastCalledWith(expect.stringContaining('filter[day]=2026-08-22'));
  });

  it('draws the row the host reads', async () => {
    apiGet.mockResolvedValueOnce({
      data: [booking({ note: "tug'ilgan kun" })],
    });

    await expect(getBookings(words, day)).resolves.toEqual([
      {
        id: '9',
        time: '18:00',
        who: 'Rustam · 6 mehmon',
        detail: "Stol 14 · tug'ilgan kun",
        state: 'confirmed',
      },
    ]);
  });

  it('claims no table for a booking that holds none', async () => {
    apiGet.mockResolvedValueOnce({
      data: [booking({ status: 'pending', table: null, note: 'deraza yonida' })],
    });

    const rows = await getBookings(words, day);

    expect(rows?.[0]).toMatchObject({ detail: 'deraza yonida', state: 'pending' });
  });

  it('leaves the parties already sitting down to the floor screen', async () => {
    apiGet.mockResolvedValueOnce({
      data: [
        booking({ id: 1, status: 'seated' }),
        booking({ id: 2, status: 'completed' }),
        booking({ id: 3, status: 'no_show' }),
        booking({ id: 4, status: 'cancelled' }),
        booking({ id: 5, status: 'pending' }),
      ],
    });

    const rows = await getBookings(words, day);

    expect(rows?.map((row) => row.id)).toEqual(['5']);
  });

  it('carries the row id, because the × and the clock write against it', async () => {
    apiGet.mockResolvedValueOnce({ data: [booking({ id: 41 })] });

    const rows = await getBookings(words, day);

    expect(rows?.[0]?.id).toBe('41');
  });
});

describe('getOpeningChecklist', () => {
  it('is not live when the API did not answer, so the panel says nothing is recorded', async () => {
    apiGet.mockResolvedValueOnce(null);

    await expect(getOpeningChecklist('2026-08-22')).resolves.toEqual({
      day: '2026-08-22',
      items: [],
      live: false,
    });
  });

  it('is live with every box unticked, which is a morning nobody has started', async () => {
    apiGet.mockResolvedValueOnce({
      data: [
        { item: 'float_counted', done: false, by: null, at: null },
        { item: 'fridge_temps', done: true, by: 'Sardor', at: '2026-08-22T07:12:00+05:00' },
      ],
      meta: { day: '2026-08-22' },
    });

    const list = await getOpeningChecklist('2026-08-22');

    expect(list.live).toBe(true);
    expect(list.items).toEqual([
      { item: 'float_counted', done: false, by: null },
      { item: 'fridge_temps', done: true, by: 'Sardor' },
    ]);
  });
});

describe('getSwappableShifts', () => {
  const now = new Date('2026-08-22T10:00:00Z');

  it('answers null when either half did not come back', async () => {
    apiGet.mockResolvedValueOnce(null).mockResolvedValueOnce({ data: [] });

    await expect(getSwappableShifts(now)).resolves.toBeNull();
  });

  it('offers only shifts that have not started, newest last', async () => {
    apiGet
      .mockResolvedValueOnce({
        data: [
          {
            id: 1,
            staff_member_id: 5,
            starts_at: '2026-08-21T09:00:00Z',
            ends_at: '2026-08-21T18:00:00Z',
            status: 'published',
          },
          {
            id: 2,
            staff_member_id: 5,
            starts_at: '2026-08-24T10:00:00Z',
            ends_at: '2026-08-24T22:00:00Z',
            status: 'published',
          },
          {
            id: 3,
            staff_member_id: 5,
            starts_at: '2026-08-23T12:00:00Z',
            ends_at: '2026-08-23T20:00:00Z',
            status: 'cancelled',
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [{ id: 5, full_name: 'Aziza', position: 'waiter', status: 'active' }],
      });

    const shifts = await getSwappableShifts(now);

    // Yesterday's is not a request anybody can act on; a cancelled shift is not
    // work anybody is expected to turn up for.
    expect(shifts?.map((shift) => shift.id)).toEqual([2]);
    // The label is built by hand rather than through `Intl`: it crosses into a
    // client component, and Node and a browser abbreviate months differently.
    expect(shifts?.[0]?.label).toBe('Aziza · 24.08 · 10–22');
  });
});
