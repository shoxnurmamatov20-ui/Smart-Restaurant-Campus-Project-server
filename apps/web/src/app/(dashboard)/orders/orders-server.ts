import { apiGet, type Paginated } from '@/lib/api-server';

import type { OrderStatus } from '../dashboard/overview-data';
import { ORDERS, type OrderChannel, type OrderRow } from './orders-data';

/**
 * The order list, from the API.
 *
 * Server half of ./orders-data.ts — the split every screen follows: types and
 * fixtures in `*-data.ts`, server calls in a sibling only server components
 * import. See tables-server.ts for why.
 */

/** `GET /api/v1/orders/orders`, narrowed to what this screen draws. */
type ApiOrder = {
  id: number;
  number: string;
  channel: string;
  status: string;
  table: { id: number | null; label: string | null } | null;
  /**
   * Who is looking after it.
   *
   * Null when nobody is — a takeaway rung up at the counter, an aggregator
   * ticket. `name` is null when the endpoint did not join the relation, which
   * is a different fact and reads the same way on screen; both draw an em dash
   * rather than an empty cell.
   */
  waiter: { id: number; name: string | null } | null;
  guests_count: number | null;
  items_count: number;
  placed_at: string | null;
  total: number;
};

/**
 * The API's order lifecycle against the six states the design's screens draw.
 *
 * `placed` is the interesting one: to the server an order is placed the moment
 * it exists, while the floor distinguishes new from accepted from cooking. Until
 * the kitchen writes those transitions back, a placed order reads as `new` —
 * which is what a waiter would call it too.
 */
export const ORDER_STATUS: Readonly<Record<string, OrderStatus>> = {
  placed: 'new',
  new: 'new',
  accepted: 'accepted',
  cooking: 'cooking',
  ready: 'ready',
  served: 'to_pay',
  to_pay: 'to_pay',
  paid: 'paid',
  closed: 'paid',
};

/** `GET /api/v1/tables/tables`, narrowed to what a transfer button says. */
type ApiTable = { id: number; label: string; is_active: boolean };

const ORDER_CHANNEL: Readonly<Record<string, OrderChannel>> = {
  dine_in: 'dine_in',
  delivery: 'delivery',
  takeaway: 'counter',
  counter: 'counter',
  aggregator: 'delivery',
};

/**
 * What one render of this screen needs.
 *
 * The rows the table draws, and the id behind each of them. `OrderRow.id` is
 * the *number* — `A-1291`, what a guest is told and what a waiter shouts — and
 * every endpoint is addressed by the row id instead. The design's row carries
 * no id and should not: it is the fixture's shape, and a fixture has no rows to
 * point at. So the map is kept beside the list, the same way `Floor.tableIds`
 * is on the floor screen, and it is empty when these are fixtures — which is
 * precisely what tells the drawer not to write anything.
 */
export type OrderList = {
  rows: readonly OrderRow[];
  /** Order number → row id, for `GET /api/orders?id=`. Empty on fixtures. */
  ids: Readonly<Record<string, number>>;
  /**
   * Where a bill can be moved to, and who can be handed it.
   *
   * Both are for the drawer's transfer sheet and neither is drawn anywhere
   * else, which is why they are fetched here rather than by the sheet: a
   * client component cannot read the session cookie, and a second round trip
   * on every drawer open would be a list the reader waits for after the click.
   *
   * `tables` is the whole floor — a bill usually moves to a table that is
   * *free*, so the set of tables already carrying orders would be exactly the
   * wrong list. `waiters` is the opposite: it is derived from these orders,
   * because the endpoint joins the relation anyway and the people with bills
   * open tonight are the people a table gets handed to. Both empty on
   * fixtures, which is what tells the sheet it has nothing real to offer.
   */
  tables: readonly { id: number; label: string }[];
  /** `label` rather than `name`: to a picker a person and a table are both a
   *  word on a button, and one shape means one grid draws either. */
  waiters: readonly { id: number; label: string }[];
};

/**
 * The order list for this render.
 *
 * `t` resolves the two labels this screen would otherwise have to guess at: a
 * table's cover count reads "5 mehmon" in the reader's language, and an order
 * with no waiter assigned yet says so rather than showing an empty cell.
 */
/**
 * What the filter panel narrows the list by.
 *
 * Every key here is an `allowedFilters` entry on `OrderController::index` —
 * checked against the router by `ConsoleQueriesTest`, which exists because a
 * filter the API does not allow comes back 400, `apiGet()` answers null, and
 * the screen quietly falls back to its fixtures. That is how `/calls` shipped
 * showing the design's tiles to real restaurants.
 */
export type OrderFilters = {
  channel?: string;
  status?: string;
  waiter?: string;
  intake?: string;
};

/**
 * The query string for one set of filters.
 *
 * Values are encoded rather than interpolated: a waiter id comes off a URL a
 * person can type, and a `filter[...]` value with an ampersand in it would
 * split into a second parameter the API never allowed.
 */
function narrow(filters: OrderFilters): string {
  const pairs: [string, string][] = [];

  if (filters.channel) pairs.push(['filter[channel]', filters.channel]);
  if (filters.status) pairs.push(['filter[status]', filters.status]);
  if (filters.waiter) pairs.push(['filter[waiter]', filters.waiter]);
  if (filters.intake) pairs.push(['filter[intake_channel]', filters.intake]);

  return pairs
    .map(([key, value]) => `&${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('');
}

export async function getOrders(
  t: (key: string) => string,
  filters: OrderFilters = {},
): Promise<OrderList> {
  const [orders, tables] = await Promise.all([
    apiGet<Paginated<ApiOrder>>(`/orders/orders?per_page=100${narrow(filters)}`),
    // In parallel, so the picker costs the screen no latency. A reader without
    // `tables.view` gets null here and a transfer sheet that offers waiters
    // only — which is honest, and better than a screen that will not open.
    apiGet<Paginated<ApiTable>>('/tables/tables?per_page=200'),
  ]);

  if (!orders?.data) return { rows: ORDERS, ids: {}, tables: [], waiters: [] };

  return {
    tables: (tables?.data ?? [])
      .filter((table) => table.is_active)
      .map((table) => ({ id: table.id, label: table.label })),
    /*
     * One entry per person, not one per bill.
     *
     * A waiter with four tables open appears four times in the list above, and
     * a picker that drew all four would ask the reader to choose between four
     * identical buttons. Nameless rows are dropped rather than shown as an em
     * dash: a button with no word on it is not a choice.
     */
    waiters: [
      ...new Map(
        orders.data
          .filter((order) => order.waiter?.name)
          .map((order) => [
            order.waiter?.id as number,
            { id: order.waiter?.id as number, label: order.waiter?.name as string },
          ]),
      ).values(),
    ],
    rows: orders.data.map((order) => ({
      id: order.number,
      where: order.table?.label ?? t('takeaway'),
      channel: ORDER_CHANNEL[order.channel] ?? 'counter',
      detail: order.guests_count ? `${order.guests_count} ${t('guests')}` : '—',
      /*
       * The name, from the endpoint's own eager load.
       *
       * `OrderResource` sends `waiter: { id, name }` and the list joins it, so
       * the column is filled without a lookup per row — which is what it used
       * to require and why it drew an em dash for everybody. Still an em dash
       * when there is genuinely nobody: a counter sale has no waiter, and
       * "system" is the fixture's word for that rather than a name to invent.
       */
      waiter: order.waiter?.name ?? '—',
      items: order.items_count,
      status: ORDER_STATUS[order.status] ?? 'new',
      // Time only. The design's column is 60px wide and every row is today.
      time: order.placed_at ? order.placed_at.slice(11, 16) : '—',
      total: order.total,
    })),
    ids: Object.fromEntries(orders.data.map((order) => [order.number, order.id])),
  };
}

/* ============================================================
   The two figures the page states about itself
   ============================================================ */

/**
 * What the line under the title can honestly say.
 *
 * `console.orders.subtitle` is the design's mock — "12 open · 192 closed today
 * · Chilonzor" — and it stood over a live, empty table on a real restaurant's
 * first morning, naming a branch that tenant does not have. These are two
 * counted reads rather than a count of the rows on screen: the table is one
 * page of a hundred, so counting it would understate a busy service, and
 * "closed today" is a trading-day question only the API can answer.
 *
 * `per_page=1` because nothing here reads the rows — only `meta.total`.
 *
 * `null` when the API did not answer, which is the fixture console; the
 * design's own sentence is the honest caption for the design's own data.
 */
export type OrderCounts = { open: number; closed: number } | null;

export async function getOrderCounts(): Promise<OrderCounts> {
  const [open, closed] = await Promise.all([
    apiGet<Paginated<ApiOrder>>('/orders/orders?per_page=1&filter[open]=1'),
    apiGet<Paginated<ApiOrder>>('/orders/orders?per_page=1&filter[today]=1&filter[status]=paid'),
  ]);

  if (open?.meta?.total === undefined) return null;

  return { open: open.meta.total, closed: closed?.meta?.total ?? 0 };
}

/**
 * The two rates the drawer's bill is built and captioned with.
 *
 * Both used to be baked into the catalogue — "Shundan QQS 12%", "Xizmat haqi
 * 10%" — beside amounts computed from the platform's own defaults. A restaurant
 * on a different rate therefore read a label that contradicted the arithmetic
 * beside it, and arithmetic that contradicted its own receipts. One read of
 * `GET /settings` answers both, and the numbers reach `billTotals()` as well as
 * the two labels, so they cannot drift apart again.
 *
 * The platform defaults are the floor when settings did not answer — a cashier
 * without `settings.view` is the normal case rather than an error — and they
 * are the same two constants `BillTotals::of()` falls back to.
 */
export type BillRates = { vat: number; service: number };

export async function getBillRates(): Promise<BillRates> {
  const settings = await apiGet<ApiRateSettings>('/settings');
  const values = settings?.data?.settings;

  return {
    vat: typeof values?.vat_percent === 'number' ? values.vat_percent : 12,
    service:
      typeof values?.service_charge_percent === 'number' ? values.service_charge_percent : 10,
  };
}

type ApiRateSettings = {
  data?: { settings?: { vat_percent?: number; service_charge_percent?: number } };
};
