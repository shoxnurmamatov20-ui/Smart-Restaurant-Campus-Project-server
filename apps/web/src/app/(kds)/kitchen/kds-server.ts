import { apiGet, type Paginated } from '@/lib/api-server';

import { STATE_OF, STOPPABLE, TICKETS, type StopEntry, type Ticket } from './kds-data';

/**
 * The board, from the API.
 *
 * Server half of ./kds-data.ts — the split every screen follows: types and
 * fixtures in `*-data.ts`, server calls in a sibling only server components
 * import. See tables-server.ts for why.
 */

/** `GET /api/v1/kitchen/tickets`, narrowed to what the board draws. */
type ApiTicket = {
  id: number;
  branch_id: number | null;
  order_number: string;
  table_label: string | null;
  station: string;
  status: string;
  /**
   * Whose section this docket came from.
   *
   * Null for an order nobody is looking after — a takeaway rung up at the
   * counter, an aggregator ticket — and `name` null when the endpoint did not
   * join the relation. Same shape as `OrderResource.waiter`, deliberately: the
   * pass and the order list name the same person.
   */
  waiter: { id: number; name: string | null } | null;
  elapsed_minutes: number;
  created_at: string | null;
  started_at: string | null;
  ready_at: string | null;
  lines:
    | readonly {
        title: string;
        quantity: number;
        note: string | null;
        modifiers?: readonly string[] | null;
        seat_no?: number | null;
      }[]
    | null;
};

/**
 * What one render of this screen needs.
 *
 * The tickets, and the room they are in. The second is not decoration: it is the
 * channel the live board subscribes to, and without it the screen paints once
 * and then sits still for the rest of service.
 */
export type KitchenBoard = {
  tickets: readonly Ticket[];
  /** The 86 sheet, so the button above the board can show a real count. */
  stops: readonly StopEntry[];
  /**
   * Which branch's channel to listen on, or `null` for none.
   *
   * Null in two honest cases. The fixture console has no branch behind it. And
   * someone reading across the whole business — an owner who has pinned no
   * venue — has no single room to listen to; they get this render and no live
   * movement, which is the truthful outcome rather than a guessed branch.
   */
  branchId: number | null;
};

/**
 * The moment a ticket's timer counts from.
 *
 * Not `elapsed_minutes`, and the difference is the point. That field freezes the
 * moment a ticket is ready — it measures how long the dish took to cook, which is
 * the right number for a report and the wrong one for a screen. The design's own
 * caption says what each column is asking: on the line, "oshxonada"; on the pass,
 * "tayyor bo'lgandan beri". A plate that has been under the lamp for nine minutes
 * has to say nine, and a frozen cook time says four forever.
 *
 * Falls back down the three timestamps rather than to `now`: a ticket with no
 * `created_at` would otherwise report itself as brand new every time the clock
 * ticked, which is the one reading that hides a problem instead of showing it.
 */
function countFrom(ticket: ApiTicket): number | undefined {
  const stamp = ticket.ready_at ?? ticket.started_at ?? ticket.created_at;

  if (stamp === null) return undefined;

  const at = Date.parse(stamp);

  return Number.isNaN(at) ? undefined : at;
}

/**
 * The board for this render.
 *
 * `station` narrows it: a cook watches one screen and the design is explicit
 * that they see their own queue and no one else's. Passing nothing returns
 * every station, which is what a chef running the pass wants.
 */
export async function getBoard(station?: string): Promise<KitchenBoard> {
  const query = station === undefined ? '' : `&station=${encodeURIComponent(station)}`;
  const tickets = await apiGet<Paginated<ApiTicket>>(`/kitchen/tickets?per_page=100${query}`);

  if (!tickets?.data) return { tickets: TICKETS, stops: fixtureStops(), branchId: null };

  const live = tickets.data.filter((ticket) => STATE_OF[ticket.status] !== undefined);

  return {
    stops: await getStopSheet(),
    /*
     * The room, taken from the dockets rather than from the reader.
     *
     * A kitchen ticket belongs to one branch by construction, so the board is
     * already the answer to "which room is this". Reading it from the session
     * instead would be right for a pinned cook and wrong for everybody else —
     * and it would be silently wrong, which is worse.
     */
    branchId: live.find((ticket) => ticket.branch_id !== null)?.branch_id ?? null,
    tickets: live.map((ticket) => ({
      id: ticket.order_number,
      ticketId: ticket.id,
      station: ticket.station,
      table: ticket.table_label ?? ticket.station,
      /*
       * The name, from the endpoint's own eager load.
       *
       * It is on the docket for one reason: when a plate has been under the
       * lamp for nine minutes, somebody has to be called, and "chip 91" is not
       * a person. An em dash where there genuinely is nobody — a counter sale
       * has no waiter, and inventing one would send a cook looking.
       */
      waiter: ticket.waiter?.name ?? '—',
      age: `${ticket.elapsed_minutes}:00`,
      minutes: ticket.elapsed_minutes,
      since: countFrom(ticket),
      state: STATE_OF[ticket.status] ?? 'colNew',
      lines: (ticket.lines ?? []).map((line) => ({
        quantity: line.quantity,
        name: line.title,
        // The fixture's `note` is a catalogue key; the API's is free text a
        // waiter typed, so it is not mapped onto it — a note that renders as a
        // missing translation key is worse than no note on a kitchen screen.
        // The modifiers are different: already words, already in the reader's
        // language, and the one thing on this board a cook must not miss.
        modifiers: line.modifiers ?? [],
        seat: line.seat_no ?? undefined,
      })),
    })),
  };
}

/** `GET /api/v1/kitchen/stop-list`, which answers the whole sheet at once. */
type ApiStopEntry = {
  dish_id: number;
  title: string;
  station: string;
  is_stopped: boolean;
  stopped_by: string | null;
  reason: string | null;
  until: string | null;
};

/**
 * Every dish this kitchen could stop, and which are off.
 *
 * A separate call from the board rather than a field on it, because the two have
 * different lifetimes: the board changes every few seconds and the menu changes
 * when somebody edits the menu. Fetched here in the same render anyway, since a
 * chef who opens the sheet expects it to be there rather than to load.
 *
 * Falls back to the fixtures on any failure, like every other read in this
 * console — a stop-list button that showed nothing because the API blinked would
 * read as "nothing is off", which is the wrong direction to be wrong in.
 */
async function getStopSheet(): Promise<readonly StopEntry[]> {
  const sheet = await apiGet<{ data: ApiStopEntry[] }>('/kitchen/stop-list');

  if (!sheet?.data) return fixtureStops();

  return sheet.data.map((entry) => ({
    dishId: entry.dish_id,
    title: entry.title,
    station: entry.station,
    stopped: entry.is_stopped,
    stoppedBy: entry.stopped_by,
    reason: entry.reason,
    until: entry.until,
  }));
}

/**
 * The demo sheet, from the fixture the design was drawn against.
 *
 * Negative ids on purpose: nothing here corresponds to a row, and a screen that
 * posted one of these would be writing about a dish that does not exist. The
 * proxy refuses a non-positive id outright, so a tap on the fixture sheet fails
 * loudly rather than 404-ing somewhere in the API.
 */
function fixtureStops(): readonly StopEntry[] {
  return STOPPABLE.map((item, index) => ({
    dishId: -(index + 1),
    title: item.name,
    station: FIXTURE_STATIONS[item.station] ?? 'hot',
    stopped: item.off,
    stoppedBy: null,
    reason: null,
    until: null,
  }));
}

/** The fixture's label keys against the API's station codes. */
const FIXTURE_STATIONS: Readonly<Record<string, string>> = {
  stationHot: 'hot',
  stationGrill: 'grill',
  stationCold: 'cold',
  stationBar: 'bar',
  stationPastry: 'pastry',
};
