import { apiGet, type Paginated } from '@/lib/api-server';

import {
  CUSTOMERS,
  feedbackFixture,
  type CustomerRow,
  type FeedbackRow,
  type FeedbackStatus,
} from './customers-data';

/**
 * Known guests and what they said, from the API.
 *
 * Server half of ./customers-data.ts — the split every screen follows: types
 * and fixtures in `*-data.ts`, server calls in a sibling only server
 * components import. See tables-server.ts for why.
 *
 * Both halves are live now. The guest list used to stay on fixtures because the
 * endpoint answered neither `segment` nor a last-visit date, and both are drawn
 * on the design's card — so wiring it would have taken two things off the
 * screen to put four on, and those two are what a marketer opens this screen
 * for. Both are columns now: `segment` is written overnight by `crm:segment`,
 * `last_visit_at` by the listener that hears `orders.paid`.
 */

/** `GET /api/v1/crm/customers`, in full. */
type ApiGuest = {
  id: number;
  name: string | null;
  phone: string;
  tier: string;
  segment: string | null;
  visits_count: number;
  total_spent: number;
  last_visit_at: string | null;
  note: string | null;
};

/**
 * The four the design's chip draws, from the four the column stores.
 *
 * A segment the console has no word for falls back to the one it does — an em
 * dash in a filter column is worse than an honest "occasional" — and so does a
 * guest nobody has classified yet, which is every guest until the first nightly
 * pass runs.
 */
const SEGMENT: Readonly<Record<string, CustomerRow['segment']>> = {
  regular: 'segRegular',
  corporate: 'segCorporate',
  occasional: 'segOccasional',
  at_risk: 'segAtRisk',
};

/** The four tiers the server knows; the design draws a fifth it never sends. */
const TIER: Readonly<Record<string, CustomerRow['tier']>> = {
  gold: 'tierGold',
  silver: 'tierSilver',
  bronze: 'tierBronze',
  platinum: 'tierPlatinum',
};

/** `GET /api/v1/crm/customers/segments` — the header's own three figures. */
type ApiSegments = {
  data: readonly { id: string; count: number }[];
  meta?: { total?: number; loyalty_members?: number };
};

export type CustomerList = {
  rows: readonly CustomerRow[];
  /** False when these are the design's six guests rather than the restaurant's. */
  live: boolean;
  /** Every guest on file, not just this page. `null` on the fixture console. */
  total: number | null;
  loyalty: number | null;
  atRisk: number | null;
};

/**
 * The guest list for this render, ordered the way a marketer reads it.
 *
 * By lifetime spend, which is the endpoint's own default and the design's
 * order: the left-hand rail is a list of who matters, and the segment chip on
 * each row is what says whether they are still coming.
 *
 * **An empty answer is an answer.** This used to read `|| guests.data.length
 * === 0` and hand back `CUSTOMERS` — so a restaurant with no CRM records was
 * shown six invented guests with phone numbers a manager could actually ring,
 * and the detail panel opened on one of them. The fixture is for `null`: no
 * session, or an API that did not reply.
 */
export async function getCustomers(): Promise<CustomerList> {
  const [guests, segments] = await Promise.all([
    apiGet<Paginated<ApiGuest>>('/crm/customers?per_page=50&sort=-total_spent'),
    apiGet<ApiSegments>('/crm/customers/segments'),
  ]);

  if (!guests?.data) {
    return { rows: CUSTOMERS, live: false, total: null, loyalty: null, atRisk: null };
  }

  const rows = guests.data.map((guest): CustomerRow => ({
    id: String(guest.id),
    // A guest with no name on file is still a guest, and the number is what the
    // person reading this screen has to ring.
    name: guest.name ?? guest.phone,
    phone: guest.phone,
    segment: SEGMENT[guest.segment ?? ''] ?? 'segOccasional',
    tier: TIER[guest.tier] ?? 'tierBronze',
    visits: guest.visits_count,
    spend: guest.total_spent,
    // Kept so the type stays satisfied; `lastVisitAt` beside it is what the
    // screen actually draws for a live row.
    lastVisit: 'lastToday',
    lastVisitAt: guest.last_visit_at,
    note: 'noteKamola',
    noteText: guest.note ?? '',
  }));

  const atRisk = segments?.data.find((row) => row.id === 'at_risk')?.count ?? null;

  return {
    rows,
    live: true,
    // `meta.total` rather than `rows.length`: the list is one page of fifty and
    // a header that undercounted the restaurant's own guests would be read as
    // a bug in the list rather than in the sentence.
    total: guests.meta?.total ?? segments?.meta?.total ?? rows.length,
    loyalty: segments?.meta?.loyalty_members ?? null,
    atRisk,
  };
}

/** One of a guest's own bills — `GET /api/v1/orders/orders?filter[customer]=`. */
type ApiGuestOrder = {
  number: string;
  channel: string;
  table: { label: string | null };
  total: number;
  closed_at: string | null;
  placed_at: string | null;
};

export type GuestOrder = {
  number: string;
  /** Where it was taken: the table when there was one, otherwise the channel. */
  where: string;
  total: number;
  at: string | null;
};

/**
 * What the selected guest actually ordered.
 *
 * The panel drew `ORDER_HISTORY` — four fixed rows from `customers-data.ts` —
 * under every guest including live ones, so a manager deciding how to treat a
 * regular read four visits that never happened. `filter[customer]` was added to
 * `OrderController::index()` for this read and nothing else.
 *
 * Five rows, because the design draws four and a fifth is what makes "there are
 * more" visible without a second screen. `null` only when there was no answer;
 * a guest who has never ordered comes back empty, which is the point.
 */
export async function getGuestOrders(customerId: number | null): Promise<readonly GuestOrder[]> {
  if (customerId === null) return [];

  const orders = await apiGet<Paginated<ApiGuestOrder>>(
    `/orders/orders?filter[customer]=${customerId}&per_page=5&sort=-created_at`,
  );

  if (!orders?.data) return [];

  return orders.data.map((order): GuestOrder => ({
    number: order.number,
    where: order.table.label ?? order.channel,
    total: order.total,
    at: order.closed_at ?? order.placed_at,
  }));
}

/** `GET /api/v1/crm/feedbacks`. */
type ApiFeedback = {
  id: number;
  customer_id: number | null;
  /*
   * The name a review carries on its own.
   *
   * A guest who scanned the QR card at a table has no account and may still
   * have typed who they are, and `POST /api/v1/public/feedback` keeps it. Read
   * here so the queue can say "Dilnoza" rather than "anonymous" about somebody
   * who signed their complaint — the one a manager most wants to ring back.
   */
  guest_name: string | null;
  score: number;
  comment: string | null;
  aspect: string | null;
  is_urgent: boolean;
  status: string;
  created_at: string | null;
};

/** `GET /api/v1/crm/customers`, for the one field a review does not carry. */
type ApiCustomer = { id: number; name: string | null };

/** The four states the model defines; anything else is not drawn. */
const STATUSES: ReadonlySet<string> = new Set(['new', 'in_review', 'resolved', 'dismissed']);

/**
 * The review queue for this render.
 *
 * Two calls rather than `?include=customer`: the resource answers with the
 * customer id and not the customer, so the name has to come from the guest list
 * either way — and that is one request for the whole page rather than one per
 * review.
 *
 * Urgent first, then newest. Not the API's own order, and that is the point:
 * a one-star with an allergy in it does not wait behind four days of fives
 * because it happened yesterday.
 */
export async function getFeedback(): Promise<readonly FeedbackRow[]> {
  const [reviews, customers] = await Promise.all([
    apiGet<Paginated<ApiFeedback>>('/crm/feedbacks?per_page=25&sort=-created_at'),
    apiGet<Paginated<ApiCustomer>>('/crm/customers?per_page=100'),
  ]);

  if (!reviews?.data) return sortForManager(feedbackFixture());

  const names = new Map<number, string | null>(
    (customers?.data ?? []).map((guest) => [guest.id, guest.name]),
  );

  const rows = reviews.data
    .filter((review) => STATUSES.has(review.status))
    .map((review): FeedbackRow => ({
      id: String(review.id),
      /*
       * The account first, then whatever the form was given.
       *
       * A review can genuinely be anonymous — the QR card on the table asks for
       * no name — so a missing one is an answer, not a failure. But an
       * anonymous review that DID leave a name is the opposite of anonymous,
       * and drawing it as one is how the complaint worth returning gets lost
       * among the ones nobody can act on.
       */
      guest: named(names, review),
      score: review.score,
      aspect: review.aspect,
      comment: review.comment ?? '',
      at: review.created_at,
      status: review.status as FeedbackStatus,
      urgent: review.is_urgent,
    }));

  return sortForManager(rows);
}

function sortForManager(rows: readonly FeedbackRow[]): readonly FeedbackRow[] {
  return [...rows].sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;

    return stamp(b) - stamp(a);
  });
}

function stamp(row: FeedbackRow): number {
  if (row.at === null) return 0;

  const at = Date.parse(row.at);

  return Number.isNaN(at) ? 0 : at;
}

/**
 * Who left this review, in the order a manager can use.
 *
 * The account's name first, then whatever the form was given. A review can
 * genuinely be anonymous — the QR card on the table asks for no name — so a
 * missing one is an answer rather than a failure. But an anonymous review that
 * DID leave a name is the opposite of anonymous, and drawing it as one is how
 * the complaint worth returning gets lost among the ones nobody can act on.
 */
function named(names: Map<number, string | null>, review: ApiFeedback): string | null {
  const linked = review.customer_id === null ? null : (names.get(review.customer_id) ?? null);

  return linked ?? review.guest_name;
}
