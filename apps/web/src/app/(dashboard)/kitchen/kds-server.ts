import { apiGet, type Paginated } from '@/lib/api-server';

import { TICKETS, type Ticket, type TicketState } from './kds-data';

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
  order_number: string;
  table_label: string | null;
  station: string;
  status: string;
  elapsed_minutes: number;
  lines: readonly { title: string; quantity: number; note: string | null }[] | null;
};

/**
 * The API's ticket states against the five columns the board has.
 *
 * `served` is a state the API keeps and the board shows briefly before the
 * ticket leaves the screen. `recalled` and `cancelled` are not columns: a
 * recalled ticket goes back to cooking, which is where the cook will find it,
 * and a cancelled one is dropped in the filter below rather than drawn — an
 * empty column headed "cancelled" is nobody's job.
 */
const TICKET_STATE: Readonly<Record<string, TicketState>> = {
  new: 'colNew',
  accepted: 'colAccepted',
  cooking: 'colCooking',
  recalled: 'colCooking',
  ready: 'colReady',
  served: 'colServed',
};

/**
 * The board for this render.
 *
 * `station` narrows it: a cook watches one screen and the design is explicit
 * that they see their own queue and no one else's. Passing nothing returns
 * every station, which is what a chef running the pass wants.
 */
export async function getTickets(station?: string): Promise<readonly Ticket[]> {
  const query = station === undefined ? '' : `&station=${encodeURIComponent(station)}`;
  const tickets = await apiGet<Paginated<ApiTicket>>(`/kitchen/tickets?per_page=100${query}`);

  if (!tickets?.data) return TICKETS;

  return tickets.data
    .filter((ticket) => TICKET_STATE[ticket.status] !== undefined)
    .map((ticket) => ({
      id: ticket.order_number,
      table: ticket.table_label ?? ticket.station,
      // TODO(api): the ticket carries no waiter. The order it came from does;
      // resolving it belongs on the endpoint, not in a request per ticket.
      waiter: '—',
      age: `${Math.floor(ticket.elapsed_minutes / 60)}:${String(ticket.elapsed_minutes % 60).padStart(2, '0')}`,
      minutes: ticket.elapsed_minutes,
      state: TICKET_STATE[ticket.status] ?? 'colNew',
      lines: (ticket.lines ?? []).map((line) => ({
        quantity: line.quantity,
        name: line.title,
        // The fixture's note is a catalogue key; the API's is free text a
        // waiter typed. Dropped rather than mistyped — a note that renders as
        // a missing translation key is worse than no note on a kitchen screen.
      })),
    }));
}
