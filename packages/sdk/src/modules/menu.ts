import type { AxiosInstance } from 'axios';
import type {
  KitchenStationCode,
  ListParams,
  ModuleInfo,
  Paginated,
  SalesChannel,
  Single,
  Translated,
} from './contracts';

// ============ Menu module types ============

export type MenuCategory = {
  id: number;
  slug: string;
  title: string | null;
  name: Translated;
  description: Translated | null;
  parent_id: number | null;
  icon: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  items_count?: number;
  items?: MenuItem[];
};

export type MenuItem = {
  id: number;
  sku: string;
  title: string | null;
  name: Translated;
  description: Translated | null;
  category: { id: number; title?: string | null; slug?: string };
  kind: 'food' | 'drink' | 'combo' | 'other';
  /** Tiyin. 45 000 so'm = 4500000. */
  price: number;
  price_uzs: number;
  cost_price: number | null;
  margin_percent: number | null;
  currency: string;
  cook_time_minutes: number;
  station: KitchenStationCode;
  weight_grams: number | null;
  calories: number | null;
  allergens: string[];
  is_halal: boolean;
  is_vegetarian: boolean;
  spice_level: number;
  is_available: boolean;
  is_orderable: boolean;
  stopped_until: string | null;
  status: 'draft' | 'active' | 'archived';
  image_url: string | null;
  sort_order: number;
  channels: SalesChannel[];
};

export type PublicMenuResponse = {
  restaurant: {
    name: string | null;
    slug: string | null;
    locale: string | null;
    timezone: string | null;
  };
  channel: SalesChannel;
  currency: string;
  data: MenuCategory[];
};

// ============ Client ============

/**
 * Menu API client.
 *
 * Module clients never import each other — same boundary as the backend
 * modules. Anything genuinely shared lives in ./contracts.
 */
export const createMenuClient = (client: AxiosInstance) => ({
  /** Capability discovery — labels, endpoints and headline counts. */
  info: () => client.get<ModuleInfo>('/menu/'),

  listCategories: (params?: ListParams) =>
    client.get<Paginated<MenuCategory>>('/menu/categories', { params }),

  getCategory: (id: number) => client.get<Single<MenuCategory>>(`/menu/categories/${id}`),

  createCategory: (payload: Partial<MenuCategory> & Record<string, unknown>) =>
    client.post<Single<MenuCategory>>('/menu/categories', payload),

  updateCategory: (id: number, payload: Partial<MenuCategory> & Record<string, unknown>) =>
    client.patch<Single<MenuCategory>>(`/menu/categories/${id}`, payload),

  deleteCategory: (id: number) => client.delete<void>(`/menu/categories/${id}`),

  listItems: (params?: ListParams) => client.get<Paginated<MenuItem>>('/menu/items', { params }),

  getItem: (id: number) => client.get<Single<MenuItem>>(`/menu/items/${id}`),

  createItem: (payload: Partial<MenuItem> & Record<string, unknown>) =>
    client.post<Single<MenuItem>>('/menu/items', payload),

  updateItem: (id: number, payload: Partial<MenuItem> & Record<string, unknown>) =>
    client.patch<Single<MenuItem>>(`/menu/items/${id}`, payload),

  deleteItem: (id: number) => client.delete<void>(`/menu/items/${id}`),

  /** Put a dish on the stop-list. `until` lets it return on its own. */
  stopItem: (id: number, until?: string) =>
    client.post<{ data: MenuItem }>(`/menu/items/${id}/stop`, { until }),

  resumeItem: (id: number) => client.post<{ data: MenuItem }>(`/menu/items/${id}/resume`),

  /** Guest-facing QR menu. No auth — the tenant comes from the X-Tenant header. */
  publicMenu: (channel: SalesChannel = 'dine_in') =>
    client.get<PublicMenuResponse>('/public/menu', { params: { channel } }),
});

export type MenuClient = ReturnType<typeof createMenuClient>;
