import { apiGet, translate, type Paginated, type Translated } from '@/lib/api-server';

import { MENU_ITEMS, type MenuRow } from './menu-data';

/**
 * The menu, from the API.
 *
 * Server half of ./menu-data.ts, split per the house rule: types and fixtures
 * in `*-data.ts`, anything that calls the server in a sibling only server
 * components import. tables-server.ts explains why the rule exists —
 * `@/lib/api-server` reads `next/headers`, which cannot survive a client
 * import.
 */

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
