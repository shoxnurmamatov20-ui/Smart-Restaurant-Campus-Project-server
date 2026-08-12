import type { AxiosInstance } from 'axios';
import type {
  KitchenStationCode,
  ListParams,
  ModuleInfo,
  Paginated,
  SalesChannel,
  Single,
} from './contracts';

// ============ Kitchen module types ============

export type KitchenStation = {
  id: number;
  code: KitchenStationCode;
  name: string;
  sla_minutes: number;
  sort_order: number;
  is_active: boolean;
};

export type KitchenTicketLine = {
  sku: string;
  title: string;
  quantity: number;
  note: string | null;
};

export type KitchenTicket = {
  id: number;
  order_id: number;
  order_number: string;
  station: KitchenStationCode;
  table_label: string | null;
  channel: SalesChannel;
  status: 'new' | 'cooking' | 'ready' | 'served' | 'recalled' | 'cancelled';
  lines: KitchenTicketLine[];
  sla_minutes: number;
  elapsed_minutes: number;
  is_late: boolean;
  started_at: string | null;
  ready_at: string | null;
  served_at: string | null;
};

// ============ Client ============

/**
 * Kitchen API client.
 *
 * Module clients never import each other — same boundary as the backend
 * modules. Anything genuinely shared lives in ./contracts.
 */
export const createKitchenClient = (client: AxiosInstance) => ({
  /** Capability discovery — labels, endpoints and headline counts. */
  info: () => client.get<ModuleInfo>('/kitchen/'),

  listStations: (params?: ListParams) =>
    client.get<Paginated<KitchenStation>>('/kitchen/stations', { params }),

  getStation: (id: number) => client.get<Single<KitchenStation>>(`/kitchen/stations/${id}`),

  createStation: (payload: Partial<KitchenStation> & Record<string, unknown>) =>
    client.post<Single<KitchenStation>>('/kitchen/stations', payload),

  updateStation: (id: number, payload: Partial<KitchenStation> & Record<string, unknown>) =>
    client.patch<Single<KitchenStation>>(`/kitchen/stations/${id}`, payload),

  deleteStation: (id: number) => client.delete<void>(`/kitchen/stations/${id}`),

  listTickets: (params?: ListParams) =>
    client.get<Paginated<KitchenTicket>>('/kitchen/tickets', { params }),

  getTicket: (id: number) => client.get<Single<KitchenTicket>>(`/kitchen/tickets/${id}`),

  createTicket: (payload: Partial<KitchenTicket> & Record<string, unknown>) =>
    client.post<Single<KitchenTicket>>('/kitchen/tickets', payload),

  updateTicket: (id: number, payload: Partial<KitchenTicket> & Record<string, unknown>) =>
    client.patch<Single<KitchenTicket>>(`/kitchen/tickets/${id}`, payload),

  deleteTicket: (id: number) => client.delete<void>(`/kitchen/tickets/${id}`),

  /** The four buttons on the KDS screen. */
  start: (id: number) => client.post<{ data: KitchenTicket }>(`/kitchen/tickets/${id}/start`),
  ready: (id: number) => client.post<{ data: KitchenTicket }>(`/kitchen/tickets/${id}/ready`),
  serve: (id: number) => client.post<{ data: KitchenTicket }>(`/kitchen/tickets/${id}/serve`),
  recall: (id: number) => client.post<{ data: KitchenTicket }>(`/kitchen/tickets/${id}/recall`),

  /** Turn an order into one ticket per station. */
  dispatchOrder: (orderId: number) =>
    client.post<{ order_id: number; tickets: KitchenTicket[] }>('/kitchen/dispatch', {
      order_id: orderId,
    }),
});

export type KitchenClient = ReturnType<typeof createKitchenClient>;
