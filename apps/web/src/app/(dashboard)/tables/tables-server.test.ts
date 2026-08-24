import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { floorFacts, getFloor, type Floor } from './tables-server';
import type { Table } from './tables-data';

/**
 * The sentence over the floor plan.
 *
 * This is the line a restaurant reported: "32 of 32 tables seated", printed one
 * line above a legend that counted its own — empty — plan. The caption came
 * from the catalogue and the legend came from the data, so the two contradicted
 * each other on every console but the demo's.
 */
function table(over: Partial<Table> = {}): Table {
  return { name: '1', seats: 4, status: 'free', ...over } as Table;
}

function floor(tables: readonly Table[], live = true): Floor {
  return {
    zones: [{ key: 'z1', label: 'Zal', tables }],
    live,
    branchId: 1,
    tableIds: {},
    orderIds: {},
  };
}

describe('floorFacts', () => {
  it('says nothing of its own over the design’s own plan', () => {
    expect(floorFacts(floor([table()], false), 'Chilonzor')).toBeNull();
  });

  it('counts an owner’s estate even though it is pinned to no venue', () => {
    // `branchId` is null for an owner reading the whole business, and reading
    // liveness off it would caption a chain's floor with the demo's sentence.
    const estate: Floor = { ...floor([table()]), branchId: null };

    expect(floorFacts(estate, 'Smart Restaurant')).toMatchObject({ tables: 1 });
  });

  it('counts what is seated the way the legend does', () => {
    const facts = floorFacts(
      floor([
        table({ name: '1', status: 'seated', guests: 4 }),
        table({ name: '2', status: 'to_pay', guests: 2 }),
        table({ name: '3', status: 'free' }),
        table({ name: '4', status: 'reserved' }),
      ]),
      'Chilonzor',
    );

    expect(facts).toEqual({ place: 'Chilonzor', tables: 4, seated: 2, covers: 6 });
  });

  it('reports an empty plan as empty rather than as thirty-two tables', () => {
    expect(floorFacts(floor([]), 'Yangi joy')).toEqual({
      place: 'Yangi joy',
      tables: 0,
      seated: 0,
      covers: 0,
    });
  });

  it('does not count covers on a table nobody is sitting at', () => {
    // A free table carries no `guests` key at all — see getFloor's spread.
    expect(floorFacts(floor([table({ status: 'free' })]), 'Chilonzor')).toMatchObject({
      covers: 0,
    });
  });
});

/* ============================================================
   The hour on a tile

   Every stamp this screen draws arrives from the API carrying the venue's own
   offset: `…T19:00:00+05:00` is not an instant a host has to convert, it is
   seven o'clock in that room. Reading one back through `new Date(iso).getHours()`
   turned it into whatever zone the machine drawing the console keeps, which was
   invisible on the boxes we own — they are all Asia/Tashkent, so the conversion
   was the identity — and five hours out everywhere else, CI included.

   Every check below is a PAIR, and that is the whole method: two stamps naming
   the same wall clock behind different offsets are different instants, so any
   reading that converts them into one zone must disagree with one of the two.
   Only reading them as written answers with the same clock twice — here, in
   UTC, anywhere. A single `+05:00` stamp passes on this box and proves nothing.
   ============================================================ */

/** One evening, written by a Tashkent venue and by one four hours west of it. */
const SAME_EVENING = ['2026-08-22T19:00:00+05:00', '2026-08-22T19:00:00+01:00'];

/** The same ten forty-two, written from those two rooms. */
const SAME_MORNING = ['2026-08-22T10:42:00+05:00', '2026-08-22T10:42:00+01:00'];

const ROW = {
  id: 12,
  label: 'A-7',
  seats: 4,
  status: 'free',
  is_active: true,
  branch_id: 3,
  hall: { id: 1 },
};

const bill = (over: Record<string, unknown> = {}) => ({
  id: 501,
  table: { id: 12, label: 'A-7' },
  waiter: { id: 4, name: 'Aziza' },
  guests_count: 3,
  total: 128_000,
  placed_at: SAME_MORNING[0],
  ...over,
});

const booking = (over: Record<string, unknown> = {}) => ({
  guest_name: 'Kamolov',
  guests_count: 6,
  starts_at: SAME_EVENING[0],
  status: 'confirmed',
  table: { id: 12 },
  ...over,
});

/** One render of the floor: the four reads `getFloor` makes, in its own order. */
async function floorWith(
  over: { bookings?: readonly unknown[]; open?: readonly unknown[] } = {},
): Promise<Floor> {
  apiGet
    .mockResolvedValueOnce({ data: [ROW] })
    .mockResolvedValueOnce({ data: [{ id: 1, name: { uz: 'Zal' } }] })
    .mockResolvedValueOnce({ data: over.bookings ?? [] })
    .mockResolvedValueOnce({ data: over.open ?? [] });

  return getFloor((key) => key, 'uz');
}

const tile = (floor: Floor): Table => floor.zones[0].tables[0];

describe('the hour on a tile', () => {
  beforeEach(() => {
    /*
     * Noon UTC. The clock has to be frozen because a hold that has already
     * started is dropped from the diary, and both halves of a pair name the
     * same evening from different rooms — one of them lands four hours earlier
     * in absolute time, and both have to still be ahead of "now".
     */
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T12:00:00Z'));
    apiGet.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it('prints the hour the party sat, not the hour this machine makes of it', async () => {
    for (const placedAt of SAME_MORNING) {
      const floor = await floorWith({ open: [bill({ placed_at: placedAt })] });

      expect(tile(floor).since).toBe('10:42');
    }
  });

  it('captions a hold with the hour the diary wrote', async () => {
    for (const startsAt of SAME_EVENING) {
      const floor = await floorWith({ bookings: [booking({ starts_at: startsAt })] });

      expect(tile(floor).reservation).toBe('19:00 · Kamolov, 6');
      expect(tile(floor).status).toBe('reserved');
    }
  });

  it('still asks the instant, not the written hour, whether a hold is over', async () => {
    /*
     * 14:00 in a +09:00 room is 05:00 UTC — two hours BEHIND the frozen clock,
     * while the hour as written reads two ahead of it. The party has come and
     * gone, so the table is free; a reading that compared written fields with
     * `Date.now()` would hold a table all afternoon for a booking already past.
     */
    const floor = await floorWith({
      bookings: [booking({ starts_at: '2026-08-22T14:00:00+09:00' })],
    });

    expect(tile(floor).reservation).toBeUndefined();
    expect(tile(floor).status).toBe('free');
  });

  it('leaves the time off a bill that does not say when it opened', async () => {
    // Undefined, not the em dash `writtenClock` gives by default: the panel
    // draws nothing there, and a dash under an occupied tile reads as a fault.
    const floor = await floorWith({ open: [bill({ placed_at: null })] });

    expect(tile(floor).since).toBeUndefined();
    expect(tile(floor).status).toBe('seated');
  });
});
