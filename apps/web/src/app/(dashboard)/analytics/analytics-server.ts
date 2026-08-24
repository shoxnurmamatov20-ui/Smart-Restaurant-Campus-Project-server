import { apiGet, translate, type Translated } from '@/lib/api-server';

import {
  CATEGORY_MIX,
  COVERS_BY_HOUR,
  DISHES,
  type DishGroup,
  GROUPS,
  SERVICE,
} from './analytics-data';

/**
 * The analytics screen, from the API.
 *
 * Server half of ./analytics-data.ts — the split every live screen follows:
 * types and fixtures in `*-data.ts`, server calls in a sibling that only server
 * components import. See tables-server.ts for why the two cannot share a file.
 *
 * ---------------------------------------------------------------------------
 * Why this returns labels rather than i18n keys
 *
 * The fixture keys its rows off the catalogue (`dishOsh`, `catNational`) and the
 * page renders `t(key)`, which is right for a demo built from the design's own
 * nine dishes. It cannot survive real data: a dish name is a proper noun that
 * arrives from the API in `{uz, ru, en}`, and there is no message catalogue on
 * earth that contains every restaurant's menu.
 *
 * So the seam is a view model. In fixture mode the labels are resolved through
 * `t()` here, once, and the page renders strings either way — which is also
 * what stops the page needing two rendering paths.
 *
 * ---------------------------------------------------------------------------
 * Dishes with no recipe cost do not appear in the table, and that is the point
 *
 * Menu engineering is a margin analysis. A dish nobody has costed has no
 * margin, so it has no quadrant — and placing it in `dogs` would accuse a dish
 * of failing for the sole reason that an accountant has not finished. The API
 * returns those under the group `uncosted`; they are counted here and left out
 * of the four groups, where a reader who wants them looks at the menu screen.
 */

/** Hours the design draws: 09:00 to 20:00, twelve bars. */
const FIRST_HOUR = 9;

const LAST_HOUR = 20;

type ApiSummary = {
  window: { period: string; from: string; to: string; days: number };
  hours: { hour: number; guests_count: number }[];
  categories: {
    slug: string;
    name: Translated | string;
    revenue_tiyin: number;
    share_percent: number;
  }[];
  void_rate_percent: number | null;
};

type ApiEngineering = {
  data: {
    sku: string;
    name: Translated | string;
    sold: number;
    price_tiyin: number;
    cost_tiyin: number | null;
    group: DishGroup | 'uncosted';
  }[];
};

export type DishView = {
  key: string;
  label: string;
  sold: number;
  price: number;
  cost: number;
  group: DishGroup;
};

export type CategoryView = { key: string; label: string; percent: number; revenue: number };

/**
 * The four figures under the charts, and why three of them are nullable.
 *
 * Turn time and ticket time are kitchen-ticket timestamps and the repeat share
 * is a CRM question; Analytics may read Menu, Orders and Finance and nothing
 * else (`ModuleBoundaryTest::ALLOWED_EDGES`). `null` is the honest answer and
 * the card draws an em dash for it — the design's own `54 min` beside a real
 * cover count would be the most trusted figure on the screen and the only
 * invented one.
 */
export type ServiceFigures = {
  turnMinutes: string | null;
  ticketTime: string | null;
  repeatShare: string | null;
  voidRate: string | null;
};

export type AnalyticsView = {
  /** False when the screen is drawing the design's sample figures. */
  live: boolean;
  /** How many trading days the figures cover, from the API's own window. */
  days: number;
  /** Twelve covers, 09:00 to 20:00, in the order the chart draws them. */
  covers: readonly number[];
  categories: readonly CategoryView[];
  dishes: readonly DishView[];
  /** Dishes sold in the period that have no recipe cost, so no margin. */
  uncosted: number;
  service: ServiceFigures;
};

/** The design's own window, for the fixture console only. */
const DEMO_DAYS = 30;

export async function getAnalytics(
  t: (key: string) => string,
  locale: string,
  period: 'today' | 'week' | 'month' = 'month',
): Promise<AnalyticsView> {
  const [summary, engineering] = await Promise.all([
    apiGet<{ data?: ApiSummary }>(`/analytics/summary?period=${period}`),
    apiGet<{ data?: ApiEngineering }>(`/analytics/menu-engineering?period=${period}`),
  ]);

  if (!summary?.data || !engineering?.data) return demo(t);

  const covers = summary.data.hours
    .filter((point) => point.hour >= FIRST_HOUR && point.hour <= LAST_HOUR)
    .map((point) => point.guests_count);

  const costed = engineering.data.data.filter(
    (dish): dish is (typeof engineering.data.data)[number] & { group: DishGroup } =>
      dish.group !== 'uncosted' && dish.cost_tiyin !== null,
  );

  return {
    live: true,
    days: summary.data.window?.days ?? DEMO_DAYS,
    covers,
    categories: summary.data.categories.map((category) => ({
      key: category.slug,
      label: translate(category.name, locale),
      percent: Math.round(category.share_percent),
      revenue: category.revenue_tiyin,
    })),
    dishes: costed.map((dish) => ({
      key: dish.sku,
      label: translate(dish.name, locale),
      sold: dish.sold,
      price: dish.price_tiyin,
      cost: dish.cost_tiyin ?? 0,
      group: dish.group,
    })),
    uncosted: engineering.data.data.length - costed.length,
    /*
     * Three nulls and one figure, rather than three constants and one figure.
     *
     * This used to spread `SERVICE` — the design's `54 min`, `8:40` and `38%` —
     * onto the live path, so a restaurant reading its own cover count read
     * three of another restaurant's numbers beside it with nothing on screen to
     * separate them. Analytics cannot reach kitchen timestamps or CRM, so the
     * card says "not measured yet" instead. Same for the void rate when the
     * server itself answers null: no bills in the window is not a 1.2% void
     * rate.
     */
    service: {
      turnMinutes: null,
      ticketTime: null,
      repeatShare: null,
      voidRate:
        summary.data.void_rate_percent === null ? null : `${summary.data.void_rate_percent}%`,
    },
  };
}

/**
 * The design's own thirty days, with every label resolved.
 *
 * Drawn when there is no session, when the API is restarting, or when the
 * reader's role cannot read `analytics.view`. `live: false` is what the shell
 * uses to say so — an invented figure presented as real is worse than a demo
 * that admits it.
 */
function demo(t: (key: string) => string): AnalyticsView {
  return {
    live: false,
    days: DEMO_DAYS,
    covers: COVERS_BY_HOUR,
    categories: CATEGORY_MIX.map((category) => ({
      key: category.key,
      label: t(category.key),
      percent: category.percent,
      revenue: category.revenue,
    })),
    dishes: DISHES.map((dish) => ({
      key: dish.key,
      label: t(dish.key),
      sold: dish.sold,
      price: dish.price,
      cost: dish.cost,
      group: dish.group,
    })),
    uncosted: 0,
    service: SERVICE,
  };
}

/**
 * The hour that seated the most guests, and how many.
 *
 * The chart's own bars read once — index 0 is `FIRST_HOUR` by the contract
 * above. Null for a window nobody sat in, because "busiest hour — 09:00, 0
 * guests" is a sentence about a closed restaurant rather than a finding about
 * a busy one.
 */
export function peakHour(covers: readonly number[]): { hour: number; guests: number } | null {
  let best = -1;

  covers.forEach((guests, index) => {
    if (best === -1 || guests > (covers[best] ?? 0)) best = index;
  });

  if (best === -1) return null;

  const guests = covers[best] ?? 0;

  return guests === 0 ? null : { hour: FIRST_HOUR + best, guests };
}

/** What the kitchen keeps of every so'm a dish takes. */
export const marginOfView = (dish: DishView): number =>
  dish.price > 0 ? Math.round(((dish.price - dish.cost) / dish.price) * 100) : 0;

/** What the dish actually earned over the period. */
export const profitOfView = (dish: DishView): number => (dish.price - dish.cost) * dish.sold;

export { GROUPS };
