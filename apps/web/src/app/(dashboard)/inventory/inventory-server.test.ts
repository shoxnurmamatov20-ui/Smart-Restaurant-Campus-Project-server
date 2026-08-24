import { describe, expect, it, vi } from 'vitest';

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('@/lib/api-server', () => ({ apiGet }));

import { getStockBoard } from './inventory-server';

/**
 * The hour beside a movement, in the zone the venue keeps rather than the one
 * the console happens to run in.
 *
 * `happened_at` arrives stamped with the venue's own offset, and this screen
 * used to read it back with `new Date(stamp).getHours()` — which is the
 * console's clock, not the kitchen's. Nobody saw it because this box, the
 * tablets and the phones are all Asia/Tashkent, so the conversion was the
 * identity; anywhere else the column reported an hour nothing happened at, and
 * a movement logged after midnight lost its time altogether.
 *
 * Every assertion below is a *pair* of stamps naming one wall clock with
 * different offsets. A single stamp cannot fail on this box, which is how the
 * fault survived here in the first place.
 */

/** One shelf line, enough of it for the board to build a row. */
const ingredient = {
  id: 7,
  name: "Mol go'shti",
  unit: 'g',
  purchase_unit: 'kg',
  factor: 1000,
  stock_quantity: 12_000,
  min_quantity: 4_000,
  cost_per_unit: 78,
  store: 'main',
  shelf_life_days: 3,
  is_active: true,
};

/**
 * The three calls the board makes, answered by path rather than by turn.
 *
 * They are issued inside one `Promise.all`, so a queue of `mockResolvedValueOnce`
 * would silently hand the movements to whichever request was reordered next.
 */
function shelfWith(movements: readonly unknown[]): void {
  apiGet.mockImplementation((path: string) => {
    if (path.startsWith('/inventory/ingredients')) return Promise.resolve({ data: [ingredient] });
    if (path.startsWith('/inventory/movements')) return Promise.resolve({ data: movements });

    return Promise.resolve({ data: [] });
  });
}

/** The time this render would print against ingredient 7's last movement. */
async function timeOf(happenedAt: string | null, now: Date): Promise<string | null | undefined> {
  shelfWith([{ ingredient_id: 7, kind: 'write_off', quantity: -2_000, happened_at: happenedAt }]);

  const board = await getStockBoard(now);

  return board.rows[0]?.lastMove?.at;
}

describe('getStockBoard', () => {
  /*
   * Midday UTC, so the reader's own date is the 27th whether the machine keeps
   * UTC or Asia/Tashkent. An hour near either midnight would make "today" mean
   * two different days in the two zones, and the assertions below would be
   * testing the test.
   */
  const noon = new Date('2026-08-27T09:00:00Z');

  it('prints the hour the venue wrote, whatever zone the console keeps', async () => {
    // Three stamps, one wall clock, three offsets: five hours apart as instants,
    // so `getHours()` cannot answer 18 for all of them in any timezone at all.
    await expect(timeOf('2026-08-27T18:00:00+05:00', noon)).resolves.toBe('18:00');
    await expect(timeOf('2026-08-27T18:00:00+00:00', noon)).resolves.toBe('18:00');
    await expect(timeOf('2026-08-27T18:00:00-04:00', noon)).resolves.toBe('18:00');
  });

  it('keeps a movement logged just after midnight on the day it was written', async () => {
    /*
     * 01:00 at +05:00 is 20:00 the previous evening in UTC. Converted, the
     * same-day check decided it did not happen today and the row lost its time
     * — a bare "−2 kg" for a write-off an hour old, which reads as history.
     */
    await expect(timeOf('2026-08-27T01:00:00+05:00', noon)).resolves.toBe('01:00');
    await expect(timeOf('2026-08-27T01:00:00-04:00', noon)).resolves.toBe('01:00');
  });

  it('still shows no time for a movement older than today', async () => {
    // `null` and a string are not interchangeable here: the screen prints the
    // quantity alone for anything older, and an hour with no date beside it
    // would claim this morning.
    await expect(timeOf('2026-08-26T18:00:00+05:00', noon)).resolves.toBeNull();
    await expect(timeOf('2026-08-26T18:00:00-04:00', noon)).resolves.toBeNull();
  });

  it('shows no time for a movement the ledger never stamped', async () => {
    await expect(timeOf(null, noon)).resolves.toBeNull();
  });
});
