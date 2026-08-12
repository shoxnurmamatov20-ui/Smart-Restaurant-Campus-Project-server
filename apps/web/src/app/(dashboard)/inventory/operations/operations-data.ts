import { apiGet, type Paginated } from '@/lib/api-server';

/**
 * Deliveries waiting to be checked in.
 *
 * The receiving tab's job is one comparison: what the supplier's document says
 * against what actually came off the van. Every line carries both numbers
 * because the difference is the only thing worth looking at — a delivery where
 * they match needs a signature, and one where they do not needs a conversation.
 *
 * Server-only: `@/lib/api-server` reads `next/headers`. Nothing in the browser
 * bundle imports this.
 */
export type DeliveryLine = {
  /** The ingredient as the supplier's document names it. Not translated. */
  name: string;
  ordered: number;
  received: number;
};

export type Delivery = {
  id: string;
  supplier: string;
  time: string;
  lines: readonly DeliveryLine[];
};

type ApiPurchaseOrder = {
  id: number;
  number: string;
  status: string;
  expected_at: string | null;
  received_at: string | null;
  supplier: { id: number; name: string } | null;
  items?: readonly { name: string; quantity: number }[];
};

type ApiSupplier = { id: number; name: string };

type ApiItem = { purchase_order_id: number; name: string; quantity: number };

/** `08:40` from an ISO timestamp — all the design's column shows. */
const clock = (iso: string | null): string => (iso === null ? '—' : iso.slice(11, 16));

/**
 * The open deliveries for this render, or `null` with no session.
 *
 * Only orders that are on their way or just arrived. A draft has not been
 * placed and a cancelled one is not coming, so neither belongs on a screen
 * whose question is "what do I check in today".
 *
 * `null` rather than a fallback: the fixture deliveries live on the screen with
 * their own catalogue keys, and keeping one copy of them there is simpler than
 * maintaining the same two documents in two shapes.
 */
export async function getDeliveries(): Promise<readonly Delivery[] | null> {
  const [orders, suppliers] = await Promise.all([
    apiGet<Paginated<ApiPurchaseOrder>>('/suppliers/purchase-orders?per_page=50'),
    apiGet<Paginated<ApiSupplier>>('/suppliers/suppliers?per_page=100'),
  ]);

  if (!orders?.data) return null;

  const names = new Map((suppliers?.data ?? []).map((supplier) => [supplier.id, supplier.name]));

  const open = orders.data.filter((order) =>
    ['sent', 'confirmed', 'received'].includes(order.status),
  );

  // Lines come with the order when the endpoint eager-loads them, and
  // separately when it does not. Both are handled rather than assumed.
  const lines = new Map<number, ApiItem[]>();

  if (open.some((order) => order.items === undefined)) {
    const items = await apiGet<Paginated<ApiItem>>('/suppliers/purchase-order-items?per_page=200');

    for (const item of items?.data ?? []) {
      lines.set(item.purchase_order_id, [...(lines.get(item.purchase_order_id) ?? []), item]);
    }
  }

  return open.map((order) => ({
    id: order.number,
    supplier: order.supplier ? (names.get(order.supplier.id) ?? '—') : '—',
    time: clock(order.received_at ?? order.expected_at),
    lines: (order.items ?? lines.get(order.id) ?? []).map((item) => ({
      name: item.name,
      ordered: item.quantity,
      // TODO(api): the received quantity is what makes this screen a check
      // rather than a list, and the line does not carry one. Until
      // `purchase_order_items` records what actually arrived, ordered is shown
      // in both columns — no variance rather than an invented one.
      received: item.quantity,
    })),
  }));
}
