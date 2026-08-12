import { apiGet, translate, type Paginated, type Translated } from '@/lib/api-server';

import type { Messages } from '@/i18n';

/**
 * The menu, as the design's screen lists it.
 *
 * Prices and costs are integer tiyin. The margin is not stored: it is
 * `(price − cost) / price`, and holding a derived figure alongside the two it
 * derives from is how a menu ends up claiming a margin its own numbers deny.
 *
 * Wired to `GET /api/v1/menu/items` — see `getMenuRows()` at the foot of this
 * file. The list below is what the screen draws when there is no session: the
 * Menu module is the canonical one (apps/api/Modules/Menu), so this was the
 * first screen the real API replaced and the shape the rest follow.
 */

type Menu = Messages['console']['menu'];

export type MenuRow = {
  id: string;
  /** A dish name is a proper noun; it is not translated. */
  name: string;
  category: keyof Pick<
    Menu,
    'catNational' | 'catBurgers' | 'catLavash' | 'catPizza' | 'catSalads' | 'catDrinks'
  >;
  station: keyof Pick<
    Menu,
    | 'stationHot'
    | 'stationGrill'
    | 'stationCold'
    | 'stationTandoor'
    | 'stationSteam'
    | 'stationPizza'
    | 'stationBar'
  >;
  price: number;
  cost: number;
  /** False when the kitchen has 86'd it — the stop list. */
  available: boolean;
  soldToday: number;
};

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

export const MENU_ITEMS: readonly MenuRow[] = [
  {
    id: 'osh',
    name: 'Osh, beef',
    category: 'catNational',
    station: 'stationHot',
    price: som(42_000),
    cost: som(15_400),
    available: true,
    soldToday: 64,
  },
  {
    id: 'lagmon',
    name: "Lag'mon",
    category: 'catNational',
    station: 'stationHot',
    price: som(38_000),
    cost: som(13_100),
    available: true,
    soldToday: 22,
  },
  {
    id: 'somsa',
    name: 'Somsa, beef',
    category: 'catNational',
    station: 'stationTandoor',
    price: som(12_000),
    cost: som(4_300),
    available: true,
    soldToday: 38,
  },
  {
    id: 'manti',
    name: 'Manti',
    category: 'catNational',
    station: 'stationSteam',
    price: som(40_000),
    cost: som(14_800),
    available: true,
    soldToday: 19,
  },
  {
    id: 'shashlik',
    name: 'Shashlik, lamb',
    category: 'catNational',
    station: 'stationGrill',
    price: som(35_000),
    cost: som(16_200),
    available: true,
    soldToday: 27,
  },
  {
    id: 'cheeseburger',
    name: 'Cheeseburger',
    category: 'catBurgers',
    station: 'stationGrill',
    price: som(39_000),
    cost: som(15_900),
    available: true,
    soldToday: 47,
  },
  {
    id: 'double-beef',
    name: 'Double beef',
    category: 'catBurgers',
    station: 'stationGrill',
    price: som(58_000),
    cost: som(26_800),
    available: false,
    soldToday: 12,
  },
  {
    id: 'lavash',
    name: 'Lavash, classic',
    category: 'catLavash',
    station: 'stationCold',
    price: som(32_000),
    cost: som(11_200),
    available: true,
    soldToday: 51,
  },
  {
    id: 'margherita',
    name: 'Margherita',
    category: 'catPizza',
    station: 'stationPizza',
    price: som(68_000),
    cost: som(21_400),
    available: true,
    soldToday: 29,
  },
  {
    id: 'pepperoni',
    name: 'Pepperoni',
    category: 'catPizza',
    station: 'stationPizza',
    price: som(82_000),
    cost: som(29_900),
    available: true,
    soldToday: 17,
  },
  {
    id: 'caesar',
    name: 'Caesar',
    category: 'catSalads',
    station: 'stationCold',
    price: som(34_000),
    cost: som(12_600),
    available: true,
    soldToday: 14,
  },
  {
    id: 'green-tea',
    name: 'Green tea',
    category: 'catDrinks',
    station: 'stationBar',
    price: som(8_000),
    cost: som(900),
    available: true,
    soldToday: 88,
  },
];

/**
 * What the kitchen keeps of every so'm the dish takes, as a percentage.
 *
 * Takes the two figures rather than a row, so it serves a fixture and an API
 * row alike. Guards the divide: an item priced at zero — a staff meal, a
 * sample — would otherwise render `NaN%` or `Infinity%` in a money column.
 */
export const marginOf = (item: { price: number; cost: number }): number =>
  item.price === 0 ? 0 : Math.round(((item.price - item.cost) / item.price) * 100);

// ============ The API seam ============

/**
 * A row as the screen draws it, with its two labels already resolved.
 *
 * The fixtures carry catalogue *keys* for category and station because they
 * were written before the API existed and a fixture cannot know a restaurant's
 * own category names. The API carries the names themselves, translated, and
 * they are not a closed set — a restaurant can call a category whatever it
 * likes. So the seam resolves both sides to a plain string and the screen
 * renders that, rather than the screen knowing which of the two it is looking
 * at.
 */
export type MenuScreenRow = Omit<MenuRow, 'category' | 'station'> & {
  categoryLabel: string;
  stationLabel: string;
};

/** What `GET /api/v1/menu/items` returns, narrowed to what this screen draws. */
type ApiMenuItem = {
  id: number;
  name: Translated | string;
  category: { id: number } | null;
  price: number;
  cost_price: number | null;
  station: string | null;
  is_available: boolean;
};

type ApiCategory = { id: number; name: Translated | string };

/**
 * The design's seven stations against the API's own values.
 *
 * The API stores a short slug; the design names each station in three
 * languages. Anything the API grows that is not in this map falls through to
 * the raw slug rather than an empty cell — a new station appearing as "pastry"
 * is a small ugliness, a blank column is a bug report.
 */
const STATION_KEYS: Readonly<Record<string, MenuRow['station']>> = {
  hot: 'stationHot',
  grill: 'stationGrill',
  cold: 'stationCold',
  tandoor: 'stationTandoor',
  steam: 'stationSteam',
  pizza: 'stationPizza',
  bar: 'stationBar',
};

/**
 * The menu for this render — the API's when there is a session, fixtures when
 * there is not.
 *
 * Two requests rather than one: items carry a category *id*, and the name that
 * belongs to it lives on the categories endpoint. They are fetched together
 * because neither is useful without the other, and a screen that draws a table
 * with an empty column while a second request lands is worse than one that
 * waits 40ms.
 *
 * `t` is passed in rather than imported: this runs on the server inside a
 * request, where the caller already holds the translator for the reader's
 * language.
 */
export async function getMenuRows(
  t: (key: string) => string,
  locale: string,
): Promise<readonly MenuScreenRow[]> {
  const [items, categories] = await Promise.all([
    // Every dish on one page. A restaurant's menu is tens of items, not
    // thousands, and the design's screen is one scrolling table with no pager.
    apiGet<Paginated<ApiMenuItem>>('/menu/items?per_page=200'),
    apiGet<Paginated<ApiCategory>>('/menu/categories?per_page=200'),
  ]);

  if (!items?.data) {
    return MENU_ITEMS.map((item) => ({
      ...item,
      categoryLabel: t(item.category),
      stationLabel: t(item.station),
    }));
  }

  const names = new Map(
    (categories?.data ?? []).map((category) => [category.id, translate(category.name, locale)]),
  );

  return items.data.map((item) => {
    const stationKey = item.station === null ? undefined : STATION_KEYS[item.station];

    return {
      id: String(item.id),
      name: translate(item.name, locale),
      price: item.price,
      // A dish with no recipe card costed yet reads as zero cost, which would
      // claim a 100% margin. Zero price is the honest answer: `marginOf` then
      // reports 0 rather than a number nobody should act on.
      cost: item.cost_price ?? item.price,
      available: item.is_available,
      // TODO(api): today's covers per dish. `GET /api/v1/analytics/sales` has
      // the figure; it is a second request and a second screen's worth of
      // mapping, so the column stays blank rather than wrong.
      soldToday: 0,
      categoryLabel: item.category ? (names.get(item.category.id) ?? '') : '',
      stationLabel: stationKey ? t(stationKey) : (item.station ?? ''),
    };
  });
}
