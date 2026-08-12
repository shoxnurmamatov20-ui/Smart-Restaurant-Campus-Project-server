import type { AxiosInstance } from 'axios';
import type { ModuleInfo, SalesChannel } from './contracts';

// ============ Analytics module types ============

export type DashboardSummary = {
  date: string;
  currency: string;
  revenue_tiyin: number;
  orders_count: number;
  guests_count: number;
  average_cheque_tiyin: number;
  open_orders: number;
  takings_tiyin: number;
  expenses_tiyin: number;
};

export type SalesPoint = { date: string; revenue_tiyin: number; orders_count: number };

export type AbcRow = {
  sku: string;
  title: string;
  quantity: number;
  revenue_tiyin: number;
  share_percent: number;
  cumulative_percent: number;
  /** A = top 80% of revenue, B = next 15%, C = the tail worth cutting. */
  class: 'A' | 'B' | 'C';
};

export type FoodCostRow = {
  sku: string;
  title: string | null;
  price_tiyin: number;
  cost_tiyin: number | null;
  margin_percent: number | null;
  /** Null when the dish has no costed recipe yet — never a fake 100%. */
  food_cost_percent: number | null;
};

export type ChannelRow = {
  channel: SalesChannel;
  orders_count: number;
  revenue_tiyin: number;
  average_cheque_tiyin: number;
};

export type HourRow = { hour: number; orders_count: number; revenue_tiyin: number };

// ============ Client ============

/** Analytics API client. Read-only by design — it never changes a number. */
export const createAnalyticsClient = (client: AxiosInstance) => ({
  info: () => client.get<ModuleInfo>('/analytics/'),

  dashboard: () => client.get<DashboardSummary>('/analytics/dashboard'),

  sales: (days = 7) =>
    client.get<{ days: number; total_revenue_tiyin: number; data: SalesPoint[] }>(
      '/analytics/sales',
      {
        params: { days },
      },
    ),

  abc: (days = 30) =>
    client.get<{ days: number; total_revenue_tiyin: number; data: AbcRow[] }>('/analytics/abc', {
      params: { days },
    }),

  foodCost: () =>
    client.get<{
      items_total: number;
      items_costed: number;
      average_food_cost_percent: number | null;
      data: FoodCostRow[];
    }>('/analytics/food-cost'),

  channels: (days = 30) =>
    client.get<{ days: number; total_revenue_tiyin: number; data: ChannelRow[] }>(
      '/analytics/channels',
      {
        params: { days },
      },
    ),

  peakHours: (days = 7) =>
    client.get<{ days: number; data: HourRow[] }>('/analytics/peak-hours', { params: { days } }),
});

export type AnalyticsClient = ReturnType<typeof createAnalyticsClient>;
