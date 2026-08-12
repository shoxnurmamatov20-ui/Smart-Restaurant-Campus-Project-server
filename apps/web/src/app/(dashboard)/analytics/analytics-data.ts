import type { Messages } from '@/i18n';

/**
 * The last thirty days, as the design's Analytics screen reads them.
 *
 * Money is integer tiyin. Margin and profit are derived from price, cost and
 * units — never stored — so a price change cannot leave a stale margin behind.
 *
 * TODO(api): GET /api/v1/analytics/summary — the API computes these across
 * branches; a client cannot, because it never sees every branch's tickets.
 */

type Analytics = Messages['console']['analytics'];

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

/** Average covers seated in each hour of service, 09:00 to 20:00. */
export const COVERS_BY_HOUR: readonly number[] = [8, 14, 26, 62, 78, 54, 38, 31, 44, 72, 88, 46];

export type CategoryShare = {
  key: keyof Pick<
    Analytics,
    'catNational' | 'catBurgers' | 'catPizza' | 'catLavash' | 'catDrinks' | 'catDesserts'
  >;
  percent: number;
  revenue: number;
};

export const CATEGORY_MIX: readonly CategoryShare[] = [
  { key: 'catNational', percent: 38, revenue: som(199_800_000) },
  { key: 'catBurgers', percent: 19, revenue: som(99_900_000) },
  { key: 'catPizza', percent: 14, revenue: som(73_600_000) },
  { key: 'catLavash', percent: 12, revenue: som(63_100_000) },
  { key: 'catDrinks', percent: 11, revenue: som(57_900_000) },
  { key: 'catDesserts', percent: 6, revenue: som(31_500_000) },
];

/**
 * Menu engineering's four groups.
 *
 * A dish that sells well at a good margin is a star; one that sells well at a
 * poor margin is a plowhorse, and the answer there is the recipe rather than
 * the menu. The names are the industry's, and the design keeps them because a
 * chef already knows what they mean.
 */
export type DishGroup = 'stars' | 'plowhorses' | 'puzzles' | 'dogs';

export type DishRow = {
  key: keyof Pick<
    Analytics,
    | 'dishOsh'
    | 'dishTea'
    | 'dishLagmon'
    | 'dishShashlik'
    | 'dishBurger'
    | 'dishPizza'
    | 'dishCaesar'
    | 'dishLavash'
    | 'dishManti'
  >;
  sold: number;
  price: number;
  cost: number;
  group: DishGroup;
};

export const DISHES: readonly DishRow[] = [
  { key: 'dishOsh', sold: 412, price: som(38_000), cost: som(14_800), group: 'stars' },
  { key: 'dishTea', sold: 388, price: som(8_000), cost: som(1_100), group: 'stars' },
  { key: 'dishLagmon', sold: 268, price: som(34_000), cost: som(13_600), group: 'stars' },
  { key: 'dishShashlik', sold: 356, price: som(26_000), cost: som(13_500), group: 'plowhorses' },
  { key: 'dishBurger', sold: 298, price: som(32_000), cost: som(15_400), group: 'plowhorses' },
  { key: 'dishPizza', sold: 142, price: som(46_000), cost: som(16_600), group: 'puzzles' },
  { key: 'dishCaesar', sold: 96, price: som(29_000), cost: som(9_300), group: 'puzzles' },
  { key: 'dishLavash', sold: 214, price: som(24_000), cost: som(13_400), group: 'dogs' },
  { key: 'dishManti', sold: 88, price: som(30_000), cost: som(17_700), group: 'dogs' },
];

export const GROUP_STYLE: Record<DishGroup, { tint: string; text: string; rail: string }> = {
  stars: { tint: 'bg-success-50', text: 'text-success-700', rail: 'var(--success-500)' },
  plowhorses: { tint: 'bg-brand-50', text: 'text-brand-700', rail: 'var(--brand-500)' },
  puzzles: { tint: 'bg-warning-50', text: 'text-warning-700', rail: 'var(--warning-500)' },
  dogs: { tint: 'bg-danger-50', text: 'text-danger-700', rail: 'var(--danger-500)' },
};

export const GROUPS: readonly DishGroup[] = ['stars', 'plowhorses', 'puzzles', 'dogs'];

/** What the kitchen keeps of every so'm the dish takes. */
export const marginOf = (dish: { price: number; cost: number }): number =>
  dish.price === 0 ? 0 : Math.round(((dish.price - dish.cost) / dish.price) * 100);

/** What the dish actually earned over the period. */
export const profitOf = (dish: { price: number; cost: number; sold: number }): number =>
  (dish.price - dish.cost) * dish.sold;

/** The four service figures the design puts under the charts. */
export const SERVICE = {
  turnMinutes: '54 min',
  ticketTime: '8:40',
  repeatShare: '38%',
  voidRate: '1.2%',
} as const;
