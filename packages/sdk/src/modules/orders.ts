import type { AxiosInstance } from 'axios';
import type {
  KitchenStationCode,
  ListParams,
  ModuleInfo,
  Paginated,
  SalesChannel,
  Single,
} from './contracts';

// ============ Orders module types ============

export type OrderStatus =
  | 'draft'
  | 'placed'
  | 'in_kitchen'
  | 'ready'
  | 'served'
  | 'on_the_way'
  | 'delivered'
  | 'paid'
  | 'cancelled';

export type Order = {
  id: number;
  number: string;
  channel: SalesChannel;
  status: OrderStatus;
  is_open: boolean;
  table: { id: number | null; label: string | null };
  waiter_user_id: number | null;
  customer_id: number | null;
  guests_count: number;
  /** All money in tiyin. */
  subtotal: number;
  discount_total: number;
  service_charge: number;
  total: number;
  total_uzs: number;
  currency: string;
  placed_at: string | null;
  closed_at: string | null;
  note: string | null;
  items?: OrderItem[];
  items_count?: number;
};

export type OrderItem = {
  id: number;
  order_id: number;
  menu_item_id: number | null;
  sku: string;
  title: string;
  station: KitchenStationCode;
  quantity: number;
  unit_price: number;
  total_price: number;
  total_uzs: number;
  status: 'pending' | 'cooking' | 'ready' | 'served' | 'cancelled';
  note: string | null;
};

// ============ Client ============

/**
 * Orders API client.
 *
 * Module clients never import each other — same boundary as the backend
 * modules. Anything genuinely shared lives in ./contracts.
 */
export const createOrdersClient = (client: AxiosInstance) => ({
  /** Capability discovery — labels, endpoints and headline counts. */
  info: () => client.get<ModuleInfo>('/orders/'),

  listOrders: (params?: ListParams) => client.get<Paginated<Order>>('/orders/orders', { params }),

  getOrder: (id: number) => client.get<Single<Order>>(`/orders/orders/${id}`),

  createOrder: (payload: Partial<Order> & Record<string, unknown>) =>
    client.post<Single<Order>>('/orders/orders', payload),

  updateOrder: (id: number, payload: Partial<Order> & Record<string, unknown>) =>
    client.patch<Single<Order>>(`/orders/orders/${id}`, payload),

  deleteOrder: (id: number) => client.delete<void>(`/orders/orders/${id}`),

  listItems: (params?: ListParams) => client.get<Paginated<OrderItem>>('/orders/items', { params }),

  getItem: (id: number) => client.get<Single<OrderItem>>(`/orders/items/${id}`),

  createItem: (payload: Partial<OrderItem> & Record<string, unknown>) =>
    client.post<Single<OrderItem>>('/orders/items', payload),

  updateItem: (id: number, payload: Partial<OrderItem> & Record<string, unknown>) =>
    client.patch<Single<OrderItem>>(`/orders/items/${id}`, payload),

  deleteItem: (id: number) => client.delete<void>(`/orders/items/${id}`),

  /** Add a dish. Price and name are snapshotted server-side from the menu. */
  addItem: (orderId: number, payload: { menu_item_id: number; quantity: number; note?: string }) =>
    client.post<{ data: OrderItem }>(`/orders/orders/${orderId}/items`, payload),

  removeItem: (orderId: number, itemId: number) =>
    client.delete<void>(`/orders/orders/${orderId}/items/${itemId}`),

  changeStatus: (orderId: number, status: OrderStatus) =>
    client.post<{ data: Order }>(`/orders/orders/${orderId}/status`, { status }),

  cancel: (orderId: number, reason: string) =>
    client.post<{ data: Order }>(`/orders/orders/${orderId}/cancel`, { reason }),
});

export type OrdersClient = ReturnType<typeof createOrdersClient>;
