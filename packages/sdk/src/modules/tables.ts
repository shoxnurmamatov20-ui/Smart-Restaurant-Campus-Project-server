import type { AxiosInstance } from 'axios';
import type { ListParams, ModuleInfo, Paginated, Single } from './contracts';

// ============ Tables module types ============

export type TableStatus = 'free' | 'occupied' | 'reserved' | 'cleaning';

export type Hall = {
  id: number;
  code: string;
  name: string;
  capacity: number;
  sort_order: number;
  is_active: boolean;
  tables_count?: number;
};

export type RestaurantTable = {
  id: number;
  label: string;
  seats: number;
  kind: 'regular' | 'vip' | 'terrace' | 'bar';
  status: TableStatus;
  is_active: boolean;
  qr_token: string | null;
  hall: { id: number; name?: string };
};

export type Reservation = {
  id: number;
  guest_name: string;
  guest_phone: string;
  guests_count: number;
  starts_at: string | null;
  ends_at: string | null;
  status: 'pending' | 'confirmed' | 'seated' | 'cancelled' | 'no_show';
  source: 'phone' | 'web' | 'bot' | 'walk_in';
  note: string | null;
  is_upcoming: boolean;
  table: { id: number | null; label?: string | null };
};

// ============ Client ============

/**
 * Tables API client.
 *
 * Module clients never import each other — same boundary as the backend
 * modules. Anything genuinely shared lives in ./contracts.
 */
export const createTablesClient = (client: AxiosInstance) => ({
  /** Capability discovery — labels, endpoints and headline counts. */
  info: () => client.get<ModuleInfo>('/tables/'),

  listHalls: (params?: ListParams) => client.get<Paginated<Hall>>('/tables/halls', { params }),

  getHall: (id: number) => client.get<Single<Hall>>(`/tables/halls/${id}`),

  createHall: (payload: Partial<Hall> & Record<string, unknown>) =>
    client.post<Single<Hall>>('/tables/halls', payload),

  updateHall: (id: number, payload: Partial<Hall> & Record<string, unknown>) =>
    client.patch<Single<Hall>>(`/tables/halls/${id}`, payload),

  deleteHall: (id: number) => client.delete<void>(`/tables/halls/${id}`),

  listTables: (params?: ListParams) =>
    client.get<Paginated<RestaurantTable>>('/tables/tables', { params }),

  getTable: (id: number) => client.get<Single<RestaurantTable>>(`/tables/tables/${id}`),

  createTable: (payload: Partial<RestaurantTable> & Record<string, unknown>) =>
    client.post<Single<RestaurantTable>>('/tables/tables', payload),

  updateTable: (id: number, payload: Partial<RestaurantTable> & Record<string, unknown>) =>
    client.patch<Single<RestaurantTable>>(`/tables/tables/${id}`, payload),

  deleteTable: (id: number) => client.delete<void>(`/tables/tables/${id}`),

  listReservations: (params?: ListParams) =>
    client.get<Paginated<Reservation>>('/tables/reservations', { params }),

  getReservation: (id: number) => client.get<Single<Reservation>>(`/tables/reservations/${id}`),

  createReservation: (payload: Partial<Reservation> & Record<string, unknown>) =>
    client.post<Single<Reservation>>('/tables/reservations', payload),

  updateReservation: (id: number, payload: Partial<Reservation> & Record<string, unknown>) =>
    client.patch<Single<Reservation>>(`/tables/reservations/${id}`, payload),

  deleteReservation: (id: number) => client.delete<void>(`/tables/reservations/${id}`),

  changeTableStatus: (id: number, status: TableStatus) =>
    client.post<{ data: RestaurantTable }>(`/tables/tables/${id}/status`, { status }),

  confirmReservation: (id: number) =>
    client.post<{ data: Reservation }>(`/tables/reservations/${id}/confirm`),

  /** Seats the guests and flips the table to occupied in one call. */
  seatReservation: (id: number) =>
    client.post<{ data: Reservation }>(`/tables/reservations/${id}/seat`),

  cancelReservation: (id: number) =>
    client.post<{ data: Reservation }>(`/tables/reservations/${id}/cancel`),
});

export type TablesClient = ReturnType<typeof createTablesClient>;
