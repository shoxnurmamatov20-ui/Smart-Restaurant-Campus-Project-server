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
const ORDER_STATUS: Readonly<Record<string, OrderStatus>> = {
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

const ORDER_CHANNEL: Readonly<Record<string, OrderChannel>> = {
  dine_in: 'dine_in',
  delivery: 'delivery',
  takeaway: 'counter',
  counter: 'counter',
  aggregator: 'delivery',
};

/**
 * The order list for this render.
 *
 * `t` resolves the two labels this screen would otherwise have to guess at: a
 * table's cover count reads "5 mehmon" in the reader's language, and an order
 * with no waiter assigned yet says so rather than showing an empty cell.
 */
export async function getOrderRows(t: (key: string) => string): Promise<readonly OrderRow[]> {
  const orders = await apiGet<Paginated<ApiOrder>>('/orders/orders?per_page=100');

  if (!orders?.data) return ORDERS;

  return orders.data.map((order) => ({
    id: order.number,
    where: order.table?.label ?? t('takeaway'),
    channel: ORDER_CHANNEL[order.channel] ?? 'counter',
    detail: order.guests_count ? `${order.guests_count} ${t('guests')}` : '—',
    // TODO(api): the resource carries `waiter_user_id` and no name. Resolving
    // it is a second request per row or an eager load on the endpoint; the
    // endpoint is the right place, so the column waits for it rather than
    // firing twenty-five lookups to fill one column.
    waiter: '—',
    items: order.items_count,
    status: ORDER_STATUS[order.status] ?? 'new',
    // Time only. The design's column is 60px wide and every row is today.
    time: order.placed_at ? order.placed_at.slice(11, 16) : '—',
    total: order.total,
  }));
}
