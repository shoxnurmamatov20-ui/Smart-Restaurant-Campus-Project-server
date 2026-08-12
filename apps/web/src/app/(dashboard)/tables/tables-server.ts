import { apiGet, translate, type Paginated, type Translated } from '@/lib/api-server';

import { TABLES, ZONES, type Table, type TableStatus } from './tables-data';

/**
 * The floor, from the API.
 *
 * Split out of ./tables-data.ts because that module is imported by the POS
 * terminal — a client component — and `@/lib/api-server` reads `next/headers`,
 * which cannot exist in a browser bundle. Next.js says so at build time rather
 * than at runtime, which is the good outcome; this file is the answer.
 *
 * The rule for every screen: types and fixtures in `*-data.ts`, anything that
 * calls the server in a sibling only server components import.
 */

/** A room, with the tables in it. What the floor screen actually draws. */
export type Zone = {
  key: string;
  /** Already resolved: a catalogue word for a fixture, the hall's own name
   *  from the API. A restaurant names its rooms whatever it likes. */
  label: string;
  tables: readonly Table[];
};

type ApiTable = {
  id: number;
  label: string;
  seats: number;
  status: string;
  is_active: boolean;
  hall: { id: number } | null;
};

type ApiHall = { id: number; name: Translated | string; sort_order?: number };

/**
 * The API's table states against the five the design draws.
 *
 * Anything unrecognised reads as free rather than throwing: a new state the
 * server grows should leave the floor drawable, and an open ring on a table
 * that is actually busy is corrected by the next poll.
 */
const TABLE_STATE: Readonly<Record<string, TableStatus>> = {
  free: 'free',
  available: 'free',
  seated: 'seated',
  occupied: 'seated',
  reserved: 'reserved',
  booked: 'reserved',
  cleaning: 'cleaning',
  dirty: 'cleaning',
  to_pay: 'to_pay',
  billed: 'to_pay',
};

/**
 * The floor for this render, grouped into rooms.
 *
 * Grouping happens here rather than on the screen because the two sources
 * disagree about what a room is: the fixtures have exactly three, named by the
 * catalogue, while a real restaurant has as many halls as it has, named by
 * itself. A screen that iterated a fixed `ZONES` list would silently drop a
 * fourth hall.
 */
export async function getFloor(
  t: (key: string) => string,
  locale: string,
): Promise<readonly Zone[]> {
  const [tables, halls] = await Promise.all([
    apiGet<Paginated<ApiTable>>('/tables/tables?per_page=200'),
    apiGet<Paginated<ApiHall>>('/tables/halls?per_page=50'),
  ]);

  if (!tables?.data) {
    return ZONES.map((zone) => ({
      key: zone,
      label: t(zone),
      tables: TABLES.filter((table) => table.zone === zone),
    }));
  }

  const rooms = halls?.data ?? [];

  return rooms.map((hall) => ({
    key: String(hall.id),
    label: translate(hall.name, locale),
    tables: tables.data
      // A table taken out of service is not on the floor. It still exists —
      // the QR code on it still resolves — but a host should not be offered it.
      .filter((table) => table.is_active && table.hall?.id === hall.id)
      .map((table) => ({
        name: table.label,
        seats: table.seats,
        status: TABLE_STATE[table.status] ?? 'free',
        // TODO(api): covers, waiter, elapsed time and the running bill live on
        // the open order, not the table. `GET /orders/orders?table=` has them;
        // joining the two is the floor screen's next step.
      })),
  }));
}
