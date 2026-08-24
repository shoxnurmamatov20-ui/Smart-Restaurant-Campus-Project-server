import { apiGet, translate, type Paginated, type Translated } from '@/lib/api-server';

import { writtenClock } from '@restaurant/surfaces/time/written';
import { isOccupied, TABLES, ZONES, type Table, type TableStatus } from './tables-data';
// The state map is a sibling module, not this one: the live board applies it
// too, and this file reads `next/headers`.
import { TABLE_STATE } from './tables-live';

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
  branch_id?: number | null;
  hall: { id: number } | null;
};

type ApiHall = { id: number; name: Translated | string; sort_order?: number };

/**
 * `GET /api/v1/orders/orders?filter[open]=1`, narrowed to what a tile shows.
 *
 * The four facts a table row does not have. See `withBill()` for why they live
 * on the order rather than on the furniture.
 */
type ApiOpenOrder = {
  id: number;
  table: { id: number | null; label: string | null } | null;
  waiter: { id: number; name: string | null } | null;
  guests_count: number | null;
  total: number;
  placed_at: string | null;
};

/** `GET /api/v1/tables/reservations`, narrowed to what a tile can show. */
type ApiReservation = {
  guest_name: string | null;
  guests_count: number;
  starts_at: string | null;
  status: string;
  table: { id: number | null };
};

/**
 * States that outrank the diary.
 *
 * A booking is a plan and these are facts. A party sitting at a held table
 * makes it occupied, not reserved, and a table being cleared is not available
 * to the 19:00 booking yet however firmly it is confirmed. Drawing the plan
 * over the fact is how a host walks a second party to an occupied table.
 */
const LIVE_STATES: ReadonlySet<TableStatus> = new Set(['seated', 'to_pay', 'cleaning']);

/** A booking that still has to be honoured, and so holds its table. */
const HOLDING = new Set(['pending', 'confirmed']);

/**
 * The floor for this render, grouped into rooms.
 *
 * Grouping happens here rather than on the screen because the two sources
 * disagree about what a room is: the fixtures have exactly three, named by the
 * catalogue, while a real restaurant has as many halls as it has, named by
 * itself. A screen that iterated a fixed `ZONES` list would silently drop a
 * fourth hall.
 */
/**
 * The floor, plus the two things a live screen needs that a tile does not show.
 *
 * `branchId` is which room's channel to listen on — `branch.{id}.floor`, the
 * channel every host, waiter and console in one building shares. `tableIds`
 * maps a label to the row behind it, because `Table` in `tables-data.ts` is the
 * design's shape and carries no id, and the QR endpoint is addressed by id.
 * Neither belongs in the fixture: they are facts about a server, and the
 * fixtures are what the screen draws when there is not one.
 */
export type Floor = {
  zones: readonly Zone[];
  /**
   * Whether the rooms came from the API.
   *
   * Not `branchId !== null`: an owner reading the whole business has no single
   * venue to listen to and gets a null id from a perfectly live answer. The
   * caption above the plan turns on this flag, and reading it off the id would
   * caption a chain's floor with the demo restaurant's sentence.
   */
  live: boolean;
  branchId: number | null;
  /** Table label → row id, for `GET /api/tables/qr?id=`. Empty on fixtures. */
  tableIds: Readonly<Record<string, number>>;
  /**
   * Table label → the id of the bill running on it, where one is.
   *
   * Its own map rather than a field on `Table`, for the reason that shape has
   * no id in the first place: `tables-data.ts` is the design's fixture and a
   * drawing has no primary keys. The panel's "move to another table" needs one,
   * because a transfer moves the BILL and not the furniture — `POST
   * /orders/orders/{id}/transfer` is addressed by order, and a table label is
   * not unique across halls anyway.
   *
   * A table with nothing running on it is simply absent, which is also what the
   * panel branches on: no bill, no transfer.
   */
  orderIds: Readonly<Record<string, number>>;
};

export async function getFloor(t: (key: string) => string, locale: string): Promise<Floor> {
  const [tables, halls, bookings, open] = await Promise.all([
    apiGet<Paginated<ApiTable>>('/tables/tables?per_page=200'),
    apiGet<Paginated<ApiHall>>('/tables/halls?per_page=50'),
    // Today's diary only. A host reads the plan as "what is still to come
    // tonight"; tomorrow's eight o'clock holds nothing this afternoon, and a
    // tile that said it did would take a table out of service for a day.
    apiGet<Paginated<ApiReservation>>(
      `/tables/reservations?per_page=100&sort=starts_at&filter[day]=${todayIso()}`,
    ),
    /*
     * Every bill that is still running, whoever opened it.
     *
     * Unfiltered by waiter, unlike the staff app's version of this join: a host
     * at the door is looking at the whole room, and "which of my tables" is a
     * question only a waiter asks. `per_page=100` is the endpoint's own ceiling
     * (`OrderController::MAX_PER_PAGE`), which is more open bills than a
     * thirty-table room has.
     */
    apiGet<Paginated<ApiOpenOrder>>('/orders/orders?per_page=100&filter[open]=true'),
  ]);

  if (!tables?.data) {
    return {
      zones: ZONES.map((zone) => ({
        key: zone,
        label: t(zone),
        tables: TABLES.filter((table) => table.zone === zone),
      })),
      live: false,
      // No server, so no channel to listen on and no id to print. The screen
      // draws the fixtures and stays still, which is the honest outcome.
      branchId: null,
      tableIds: {},
      orderIds: {},
    };
  }

  const rooms = halls?.data ?? [];
  const held = holdsByTable(bookings?.data ?? []);
  const running = billsByTable(open?.data ?? []);

  const zones = rooms.map((hall) => ({
    key: String(hall.id),
    label: translate(hall.name, locale),
    tables: tables.data
      // A table taken out of service is not on the floor. It still exists —
      // the QR code on it still resolves — but a host should not be offered it.
      .filter((table) => table.is_active && table.hall?.id === hall.id)
      .map((table): Table => {
        const bill = running.get(table.id);
        const known = TABLE_STATE[table.status] ?? 'free';

        /*
         * The bill outranks the floor plan.
         *
         * A table whose row still says `free` while an open order sits on it is
         * a table somebody sat without touching the plan, which happens every
         * service — a waiter fires an order from a handset and nobody walks
         * back to the door to colour a square. Reading the plan over the bill
         * is how a host walks a second party to an occupied table, which is the
         * one mistake this screen exists to prevent.
         */
        const state = bill !== undefined && known === 'free' ? 'seated' : known;
        const booking = held.get(table.id);

        return {
          name: table.label,
          seats: table.seats,
          // The diary can promote a free table to held, and never demotes a
          // table that is in use — see LIVE_STATES.
          status: booking !== undefined && !LIVE_STATES.has(state) ? 'reserved' : state,
          reservation: booking,
          /*
           * Covers, waiter, when they sat and what they owe — all four from the
           * bill, none of them from the table. Spread rather than assigned so a
           * table with nothing on it carries no keys at all: `Table` marks them
           * optional and `metaFor()` on the page branches on `undefined`, so an
           * empty table with `guests: 0` would draw "0 mehmon" under it.
           */
          ...(bill === undefined
            ? {}
            : {
                guests:
                  bill.guests_count === null || bill.guests_count === 0
                    ? undefined
                    : bill.guests_count,
                since: satAt(bill.placed_at),
                waiter: bill.waiter?.name ?? undefined,
                bill: bill.total,
              }),
        };
      }),
  }));

  return {
    zones,
    live: true,
    // Every table in this payload is in one venue — the API narrows by
    // `X-Branch`, and a request with no branch is an owner reading the whole
    // business, who has no single room to listen to.
    branchId: tables.data.find((table) => table.branch_id != null)?.branch_id ?? null,
    tableIds: Object.fromEntries(tables.data.map((table) => [table.label, table.id])),
    /* Keyed by label because that is what the board matches on everywhere else
       — the socket carries a label, and `recolour()` looks one up. `running`
       is keyed by table id, so the two are joined here where both are known. */
    orderIds: Object.fromEntries(
      tables.data
        .map((table) => [table.label, running.get(table.id)?.id] as const)
        .filter((pair): pair is readonly [string, number] => pair[1] !== undefined),
    ),
  };
}

/**
 * The next party expected at each table, in the tile's own words.
 *
 * The *next* one, not all of them: a tile has one line for this, and the answer
 * a host wants from a glance is who is coming, not who came. A booking that has
 * already started is not shown at all — either they are sitting there, in which
 * case the table's own state says so, or they did not turn up, which is a
 * conversation rather than a tile.
 *
 * The list arrives sorted by start time, so the first hold seen for a table is
 * the earliest one.
 */
function holdsByTable(bookings: readonly ApiReservation[]): Map<number, string> {
  const now = Date.now();
  const held = new Map<number, string>();

  for (const booking of bookings) {
    const id = booking.table.id;
    const at = booking.starts_at === null ? Number.NaN : Date.parse(booking.starts_at);

    if (id === null || Number.isNaN(at) || at < now) continue;
    if (!HOLDING.has(booking.status) || held.has(id)) continue;

    /*
     * `19:00 · Kamolov, 6` — the design's own shorthand: when, who, how many.
     *
     * Two readings of one stamp, deliberately. "Has it started yet" is a
     * question about instants, and `Date.parse` above answers it correctly
     * anywhere, because the offset in the stamp puts the booking on the same
     * line as this machine's clock. What the tile PRINTS is not an instant but
     * the written fact — 19:00 means seven o'clock in that room — so it is read
     * back as written. Putting the converted hour on the tile captioned the
     * same booking 14:00 on a console in UTC, and 14:00 is the hour a host
     * would then hold the table for.
     */
    held.set(
      id,
      `${writtenClock(booking.starts_at)} · ${booking.guest_name ?? '—'}, ${booking.guests_count}`,
    );
  }

  return held;
}

/**
 * The bill running on each table, by table id.
 *
 * A table legitimately carries several — `BILLS_PER_TABLE` is four, one per
 * party sharing a big top — and this keeps the **earliest**, because every
 * figure the tile draws is about the party rather than about the newest cheque:
 * how long they have been sitting, how many of them there are, whose section
 * they are in.
 *
 * The same reading as the staff app's `floorFrom()`, deliberately: a waiter's
 * handset and the console's floor plan disagreeing about which bill is on
 * table 12 is worse than either of them being wrong on its own.
 */
function billsByTable(orders: readonly ApiOpenOrder[]): Map<number, ApiOpenOrder> {
  const running = new Map<number, ApiOpenOrder>();

  for (const order of orders) {
    const id = order.table?.id;

    // A takeaway, a delivery or an aggregator ticket. Real orders, no table.
    if (id === null || id === undefined) continue;

    const held = running.get(id);

    if (held === undefined || (order.placed_at ?? '') < (held.placed_at ?? '')) {
      running.set(id, order);
    }
  }

  return running;
}

/**
 * When this party sat, as the bill writes it — `10:42`.
 *
 * The venue's own hour, never the reader's. `placed_at` arrives with the
 * restaurant's offset — `…T10:42:00+05:00` is "10:42, in that room" — and
 * turning that instant into the machine's zone printed 05:42 for the same party
 * on a console running in UTC. A host reads this figure as "how long have they
 * been sitting", so five hours of drift is a party asked to settle up while
 * their mains are still coming.
 *
 * Undefined rather than a placeholder when the stamp is missing or unreadable,
 * which is why the em dash `writtenClock` would give is refused here: the panel
 * already draws nothing at all for a table whose bill does not say when it
 * opened, and a dash under an occupied tile reads as a broken till.
 */
function satAt(iso: string | null): string | undefined {
  const written = writtenClock(iso, '');

  return written === '' ? undefined : written;
}

/** Today as `YYYY-MM-DD`, which is what the diary filter takes. */
function todayIso(): string {
  const today = new Date();

  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
}

/* ============================================================
   The line under the title
   ============================================================ */

/**
 * What the caption over the plan can honestly say.
 *
 * `console.floor.subtitle` is the design's mock — "Chilonzor · 32 stol · 14
 * tasi band · hozircha 118 mehmon" — and it was printed one line above a
 * legend that counts the real tables, so the two contradicted each other on
 * every screen but the demo's. This is the same arithmetic the legend does.
 *
 * `null` means the plan is the fixture, and the design's own sentence is the
 * honest caption for the design's own data.
 */
export type FloorFacts = {
  place: string;
  tables: number;
  seated: number;
  covers: number;
} | null;

export function floorFacts(floor: Floor, place: string): FloorFacts {
  if (!floor.live) return null;

  const tables = floor.zones.flatMap((zone) => zone.tables);

  return {
    place,
    tables: tables.length,
    seated: tables.filter((table) => isOccupied(table)).length,
    /*
     * Covers on the floor right now, not covers served today.
     *
     * The design's sentence says "so far", which is a takings figure, and no
     * read on this screen carries one — the open bills do not know about the
     * ones already closed. Counting who is sitting down is the question the
     * plan can actually answer, and the wording says that rather than implying
     * a day's total.
     */
    covers: tables.reduce((sum, table) => sum + (table.guests ?? 0), 0),
  };
}

/* ============================================================
   The layout editor

   The design draws an "edit layout" button on the floor screen and it was an
   `ActionButton`: it flashed a sentence about a plan editor and opened nothing.
   A drag-and-drop canvas over a scale drawing of the room is a screen rather
   than a control — and it is also not what the design's plan IS: a wrapping
   grid of equal tiles, where what a table needs is a PLACE IN ITS ROOM rather
   than an (x, y).

   So the editor is a list, and it writes the two facts that decide where a tile
   lands: `position` within the hall, and which hall. Both go through
   `PATCH /v1/tables/tables/{table}`, one tile per call.
   ============================================================ */

/** A table as the layout editor addresses it — by id, with its room. */
export type PlanTable = {
  id: number;
  label: string;
  hallId: number | null;
  /** Where the tile sits in its hall. 0 is "nobody has placed it". */
  position: number;
};

export type FloorPlanRooms = {
  halls: readonly { id: number; name: string }[];
  tables: readonly PlanTable[];
};

/**
 * Every room and every table in it, or null when there is no session.
 *
 * A second read beside `getFloor()` rather than a field on it, and the reason
 * is what each is for: the board draws STATE — who is sitting where, what the
 * bill is — and is redrawn every few seconds off a realtime channel, while this
 * is the furniture and changes when somebody moves a chair. Folding them
 * together would put hall ids and positions into a payload that is refetched on
 * every nudge.
 *
 * An empty list is a real answer: a restaurant that has not built its rooms yet
 * has none, and the editor says so rather than offering an empty plan.
 */
export async function getFloorPlan(locale: string): Promise<FloorPlanRooms | null> {
  const [halls, tables] = await Promise.all([
    apiGet<Paginated<ApiPlanHall>>('/tables/halls?per_page=100'),
    apiGet<Paginated<ApiPlanTable>>('/tables/tables?per_page=300'),
  ]);

  if (!halls?.data || !tables?.data) return null;

  return {
    halls: halls.data.map((hall) => ({ id: hall.id, name: translate(hall.name, locale) })),
    tables: tables.data
      .filter((table) => table.is_active)
      .map((table) => ({
        id: table.id,
        label: table.label,
        hallId: table.hall?.id ?? null,
        position: table.position ?? 0,
      })),
  };
}

/** `GET /api/v1/tables/halls`, narrowed to what the editor's select offers. */
type ApiPlanHall = { id: number; name: Translated | string };

/** `GET /api/v1/tables/tables`, narrowed to what a tile is moved by. */
type ApiPlanTable = {
  id: number;
  label: string;
  is_active: boolean;
  position?: number;
  hall: { id: number } | null;
};
