import { apiGet, translate, type Translated } from '@/lib/api-server';

import { CATEGORY_MIX, COVERS_BY_HOUR, DISHES, type DishGroup } from './analytics-data';

/**
 * The analytics screen, from the API.
 *
 * Split from ./analytics-data.ts for the usual reason: `@/lib/api-server` reads
 * `next/headers`, so anything importing it can only be imported by a server
 * component.
 *
 * The analytics endpoints do not return the paginated envelope the resource
 * lists use — each is a computed report with its own shape — so these are typed
 * one by one rather than through `Paginated<T>`.
 */

/** A dish on the menu-engineering matrix, with its labels resolved. */
export type DishScreenRow = {
  id: string;
  name: string;
  sold: number;
  price: number;
  cost: number;
  group: DishGroup;
};

export type CategoryScreenRow = { id: string; name: string; percent: number; revenue: number };

type FoodCost = {
  data: readonly {
    sku: string;
    title: string;
    price_tiyin: number;
    cost_tiyin: number;
    margin_percent: number;
  }[];
};

type Abc = { data: readonly { sku: string; title: string; quantity: number }[] };

type PeakHours = { data: readonly { hour: number; orders_count: number }[] };

type MenuItem = {
  data: readonly { sku: string; category: { id: number } | null; price: number }[];
};

type Categories = { data: readonly { id: number; name: Translated | string }[] };

/** The trading hours the design's chart draws: ten in the morning to nine at night. */
const OPEN_FROM = 10;

const OPEN_TO = 21;

/**
 * Menu engineering's four groups (Kasavana–Smith).
 *
 * A dish is popular if it sold more than the average dish, and profitable if
 * its margin beats the menu's average margin. Popular *and* profitable is a
 * star; popular but thin is a plowhorse, and the answer there is the recipe
 * rather than the menu.
 *
 * Computing this here is safe in a way that deriving a customer's "segment"
 * was not: the four groups are a published method with a stated rule, not a
 * label the restaurant has to agree with. The rule is written above so a chef
 * disagreeing with a classification can see exactly what put it there.
 */
function classify(sold: number, margin: number, avgSold: number, avgMargin: number): DishGroup {
  const popular = sold >= avgSold;
  const profitable = margin >= avgMargin;

  if (popular && profitable) return 'stars';
  if (popular) return 'plowhorses';
  if (profitable) return 'puzzles';

  return 'dogs';
}

/**
 * The menu-engineering matrix for this render.
 *
 * Two reports joined on the SKU: food-cost knows what each dish earns, ABC
 * knows how many went out. Neither alone can place a dish on the matrix.
 *
 * A dish nobody ordered in the window is dropped rather than shown at zero. It
 * has no position on a matrix whose axes are popularity and margin, and a
 * column of dogs that are only dogs because nobody could buy them tells a chef
 * nothing.
 */
export async function getMenuEngineering(
  t: (key: string) => string,
): Promise<readonly DishScreenRow[]> {
  const [costs, abc] = await Promise.all([
    apiGet<FoodCost>('/analytics/food-cost'),
    apiGet<Abc>('/analytics/abc'),
  ]);

  if (!costs?.data || !abc?.data) {
    return DISHES.map((dish) => ({
      id: dish.key,
      name: t(dish.key),
      sold: dish.sold,
      price: dish.price,
      cost: dish.cost,
      group: dish.group,
    }));
  }

  const sold = new Map(abc.data.map((row) => [row.sku, row.quantity]));

  const rows = costs.data
    .filter((dish) => (sold.get(dish.sku) ?? 0) > 0)
    .map((dish) => ({
      id: dish.sku,
      name: dish.title,
      sold: sold.get(dish.sku) ?? 0,
      price: dish.price_tiyin,
      cost: dish.cost_tiyin,
      margin: dish.margin_percent,
    }));

  if (rows.length === 0) return [];

  const avgSold = rows.reduce((total, row) => total + row.sold, 0) / rows.length;
  const avgMargin = rows.reduce((total, row) => total + row.margin, 0) / rows.length;

  return (
    rows
      .map(({ margin, ...row }) => ({
        ...row,
        group: classify(row.sold, margin, avgSold, avgMargin),
      }))
      // Best sellers first, which is the order a chef reads the matrix in.
      .sort((a, b) => b.sold - a.sold)
  );
}

/**
 * Covers per hour across the trading day.
 *
 * The API answers with all twenty-four; the design's chart draws the twelve the
 * restaurant is open for. Hours the API omits read as zero rather than
 * shortening the chart — a quiet hour is information, a missing bar is a gap.
 */
export async function getCoversByHour(): Promise<readonly number[]> {
  const peak = await apiGet<PeakHours>('/analytics/peak-hours');

  if (!peak?.data) return COVERS_BY_HOUR;

  const byHour = new Map(peak.data.map((row) => [row.hour, row.orders_count]));

  return Array.from({ length: OPEN_TO - OPEN_FROM + 1 }, (_, index) =>
    Math.round(byHour.get(OPEN_FROM + index) ?? 0),
  );
}

/**
 * Revenue by menu category.
 *
 * Three reports, because no single endpoint carries it: ABC has revenue per
 * SKU, the menu has which category each SKU belongs to, and the category list
 * has what that category is called. Joining them here rather than asking for a
 * fourth endpoint keeps the API's reports about one thing each.
 *
 * Shares are computed from the revenue actually attributed, not from the
 * report's own total: a dish whose category was deleted would otherwise make
 * the slices add up to less than the whole and the chart quietly wrong.
 */
export async function getCategoryMix(
  t: (key: string) => string,
  locale: string,
): Promise<readonly CategoryScreenRow[]> {
  const [abc, items, categories] = await Promise.all([
    apiGet<Abc & { data: readonly { sku: string; revenue_tiyin: number }[] }>('/analytics/abc'),
    apiGet<MenuItem>('/menu/items?per_page=300'),
    apiGet<Categories>('/menu/categories?per_page=100'),
  ]);

  if (!abc?.data || !items?.data || !categories?.data) {
    return CATEGORY_MIX.map((category) => ({
      id: category.key,
      name: t(category.key),
      percent: category.percent,
      revenue: category.revenue,
    }));
  }

  const categoryOf = new Map(items.data.map((item) => [item.sku, item.category?.id ?? null]));
  const names = new Map(categories.data.map((c) => [c.id, translate(c.name, locale)]));
  const revenue = new Map<number, number>();

  for (const row of abc.data) {
    const id = categoryOf.get(row.sku);

    if (id === null || id === undefined) continue;

    revenue.set(
      id,
      (revenue.get(id) ?? 0) + ((row as { revenue_tiyin?: number }).revenue_tiyin ?? 0),
    );
  }

  const total = [...revenue.values()].reduce((sum, value) => sum + value, 0);

  if (total === 0) return [];

  return [...revenue.entries()]
    .map(([id, value]) => ({
      id: String(id),
      name: names.get(id) ?? '—',
      percent: Math.round((value / total) * 100),
      revenue: value,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}
