import { dishImageFrom, type DishImage, type ImagePayload } from '@restaurant/surfaces/media/image';

import { apiGet, translate, type Paginated, type Translated } from '@/lib/api-server';

import { MENU_ITEMS, type CategoryRow, type MenuRow, type ModifierGroup } from './menu-data';

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
  /**
   * The dish's photograph, or null.
   *
   * Not in the fixtures and not in the design's table — it exists so the editor
   * can show what is already there before somebody replaces it. Uploading a new
   * picture over an unseen one is how a menu ends up with the wrong dish on it.
   */
  imageUrl: string | null;
  /**
   * The same photograph at every size the platform keeps, with a placeholder
   * — see `@restaurant/surfaces/media/image`. The table's 40px thumbnail
   * draws `thumb`, the editor's preview draws `card`; `imageUrl` stays for the
   * "no photograph" filter and the one-address readers.
   */
  image: DishImage | null;
  /**
   * The stored `{uz, ru, en}` column, when it came from the API.
   *
   * `name` above is one of the three, resolved for the reader. This is all of
   * them, and the screen needs all of them for two things: the search box
   * matches whichever name the person typing knows — a Russian-speaking
   * manager on an Uzbek console types «Плов» — and the editor drawer opens
   * with the other two already filled in rather than blank, which is what
   * stops a save from quietly emptying them.
   *
   * Optional because the fixtures have one name and no column behind it.
   */
  names?: Translated;
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
  image_url: string | null;
  image?: ImagePayload | null;
};

type ApiCategory = { id: number; name: Translated | string };

/**
 * What `GET /api/v1/analytics/menu-engineering` returns, narrowed to the one
 * figure this screen wants.
 *
 * Not `/analytics/sales`, which was the endpoint the old marker named: that one
 * answers a per-DAY series — revenue and bill count per date — and has no dish
 * in it at all, so no amount of mapping could produce a per-dish number from
 * it. Menu engineering is the read that groups sold lines by `menu_items.id`,
 * which is the key this table is already drawn from.
 *
 * `period=today` is the venue's trading day rather than midnight-to-midnight:
 * `ReportWindow` works on `business_date`, so a bill rung up at 01:30 counts
 * against the evening that is still finishing — the same boundary the Z-report
 * a cashier signed used. A dish column that disagreed with the Z-report would
 * be the console arguing with the till.
 *
 * The envelope is nested and that is not a typo: the controller wraps the
 * report in `data`, and the report is itself `{window, median_sold,
 * median_margin_percent, data}`. Reading the outer `data` as the list is the
 * mistake this type exists to make impossible — it would parse, and every dish
 * would silently read zero.
 */
type ApiSoldToday = { data?: { data?: { menu_item_id: number; sold: number }[] } };

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

export type MenuScreen = {
  rows: readonly MenuScreenRow[];
  /**
   * Whether the rows came from the API.
   *
   * The caption above the table depends on it: the design's sentence is only
   * honest over the design's own data, and a live restaurant — even one with
   * no dishes yet — gets counted rather than described.
   */
  live: boolean;
};

/**
 * The menu for this render — the API's when there is a session, fixtures when
 * there is not.
 *
 * Three requests rather than one, and all three at once. Items carry a category
 * *id* and the name that belongs to it lives on the categories endpoint;
 * today's covers per dish live on the analytics one. None is useful without the
 * first and a screen that draws a table with two empty columns while later
 * requests land is worse than one that waits 40ms for all of them.
 *
 * Only the items read decides whether this render is live. The other two are
 * columns: a restaurant whose analytics permission the reader does not hold
 * still gets its menu, with the covers column reading zero — which the shell's
 * "some figures are samples" line then says out loud, correctly, because that
 * column did fall back.
 *
 * `t` is passed in rather than imported: this runs on the server inside a
 * request, where the caller already holds the translator for the reader's
 * language.
 */
export async function getMenuRows(t: (key: string) => string, locale: string): Promise<MenuScreen> {
  const [items, categories, soldToday] = await Promise.all([
    // Every dish on one page. A restaurant's menu is tens of items, not
    // thousands, and the design's screen is one scrolling table with no pager.
    apiGet<Paginated<ApiMenuItem>>('/menu/items?per_page=200'),
    apiGet<Paginated<ApiCategory>>('/menu/categories?per_page=200'),
    apiGet<ApiSoldToday>('/analytics/menu-engineering?period=today'),
  ]);

  if (!items?.data) {
    return {
      live: false,
      rows: MENU_ITEMS.map((item) => ({
        ...item,
        categoryLabel: t(item.category),
        stationLabel: t(item.station),
        // No server, so no photographs and no upload button — see the editor.
        imageUrl: null,
        image: null,
      })),
    };
  }

  const names = new Map(
    (categories?.data ?? []).map((category) => [category.id, translate(category.name, locale)]),
  );

  /*
   * Covers by dish id.
   *
   * A dish that sold nothing today is absent from the report rather than
   * present with a zero — the query groups sold lines, and a dish with no lines
   * has no group. So the lookup's default is 0 and that is the same answer,
   * which is why nothing here has to distinguish "sold none" from "not asked".
   */
  const sold = new Map((soldToday?.data?.data ?? []).map((row) => [row.menu_item_id, row.sold]));

  const rows = items.data.map((item): MenuScreenRow => {
    const stationKey = item.station === null ? undefined : STATION_KEYS[item.station];

    return {
      id: String(item.id),
      name: translate(item.name, locale),
      // Only when it really is the three-language column. A dish stored as a
      // plain string has nothing extra to search or to edit, and claiming
      // otherwise would put the same word in all three drawer fields.
      names: typeof item.name === 'string' ? undefined : item.name,
      price: item.price,
      // A dish with no recipe card costed yet reads as zero cost, which would
      // claim a 100% margin. Zero price is the honest answer: `marginOf` then
      // reports 0 rather than a number nobody should act on.
      cost: item.cost_price ?? item.price,
      available: item.is_available,
      soldToday: sold.get(item.id) ?? 0,
      categoryLabel: item.category ? (names.get(item.category.id) ?? '') : '',
      stationLabel: stationKey ? t(stationKey) : (item.station ?? ''),
      imageUrl: item.image_url,
      image: dishImageFrom(item.image, item.image_url),
    };
  });

  return { rows, live: true };
}

/* ============================================================
   Categories, the tab

   The tab used to map the `CATEGORIES` fixture unconditionally — eight Uzbek
   section names with item counts — so a restaurant that had built its own
   sections still read "Milliy taomlar 18 · Kabob 9 …", and the empty state
   wired into the table could never fire. The list is one request the items
   read already makes beside it, with `items_count` coming down from
   `withCount('items')`.
   ============================================================ */

/** `null` means the API did not answer; `[]` means this restaurant has none. */
export async function getMenuCategories(locale: string): Promise<readonly CategoryRow[] | null> {
  const categories = await apiGet<Paginated<ApiCategoryRow>>('/menu/categories?per_page=200');

  if (!categories?.data) return null;

  return categories.data.map((category, index) => ({
    id: String(category.id),
    name: translate(category.name, locale),
    // `sort_order` is the restaurant's own ordering and may be all zeroes on a
    // menu nobody has arranged yet. The row number is then the honest answer:
    // the table's first column says where the section sits, and every section
    // sitting at "0" says nothing at all.
    position: category.sort_order === 0 ? index + 1 : category.sort_order,
    items: category.items_count ?? 0,
    visible: category.is_active,
  }));
}

/** `GET /api/v1/menu/categories`, the columns this tab draws. */
type ApiCategoryRow = {
  id: number;
  name: Translated | string;
  sort_order: number;
  is_active: boolean;
  items_count?: number;
};

/* ============================================================
   The line under the title
   ============================================================ */

/**
 * What the caption can honestly say about this menu.
 *
 * The catalogue's sentence — "20 items in 7 categories · 1 sold out · prices
 * include 12% VAT" — is the design's mock. Two of its three clauses are counts
 * of the fixture, and the third asserts a tax rate that is a tenant setting.
 * Stood over a live, empty menu it was wrong three times in one line.
 *
 * `null` means the page is drawing the fixture, and the design's own sentence
 * is the honest caption for the design's own data.
 */
export type MenuFacts = { items: number; categories: number; stopped: number } | null;

export function menuFacts(rows: readonly MenuScreenRow[], live: boolean): MenuFacts {
  if (!live) return null;

  return {
    items: rows.length,
    // Counted off the rows rather than off the categories read: a section with
    // no dishes is not a section this sentence should claim.
    categories: new Set(rows.map((row) => row.categoryLabel).filter((label) => label !== '')).size,
    stopped: rows.filter((row) => !row.available).length,
  };
}

/**
 * The VAT rate to print in the caption, or null when there is none to print.
 *
 * `settings.legal.vat_registered` decides whether the clause appears at all —
 * a restaurant outside the VAT regime whose prices are captioned "includes
 * 12% VAT" is a statement its own receipts contradict — and
 * `settings.vat_percent` decides the number. Null when settings did not
 * answer, which for a reader without the permission is the normal case.
 */
export async function getVatPercent(): Promise<number | null> {
  const settings = await apiGet<ApiVatSettings>('/settings');
  const values = settings?.data?.settings;

  if (values === undefined) return null;
  if (values.legal?.vat_registered === false) return null;

  return typeof values.vat_percent === 'number' ? values.vat_percent : null;
}

type ApiVatSettings = {
  data?: { settings?: { vat_percent?: number; legal?: { vat_registered?: boolean } } };
};

/* ============================================================
   Modifier groups — the questions a dish asks

   The Modifiers tab drew three groups out of `menu-data.ts` — "Ulush · used by
   24 dishes" — over restaurants that had never priced a portion that way, and
   then drew an honest note instead, because no staff-facing read existed. The
   groups reached the till and the QR menu through `GET /v1/public/menu`, which
   answers them PER DISH: the right cut for somebody ordering and the wrong one
   for somebody checking whether a sheet is still doing work.
   ============================================================ */

/** `GET /api/v1/menu/modifier-groups` → `data[]`, exactly as it is sent. */
type ApiModifierGroup = {
  id: number;
  title: string | null;
  is_multi: boolean;
  min_choices: number;
  max_choices: number;
  is_active: boolean;
  /** How many dishes ask this question. */
  used_by?: number;
  choices?: readonly {
    id: number;
    title: string | null;
    price_delta_tiyin: number;
    is_active: boolean;
  }[];
};

/**
 * Every sheet this restaurant maintains, or null when there is no session.
 *
 * An empty list is a real answer: a restaurant that asks no questions about its
 * dishes asks none, and the tab says so. Null is the demo console, where the
 * design's own three groups are the honest thing to draw.
 *
 * A switched-off group is kept rather than filtered. "Switched off" is exactly
 * what somebody opening this tab is looking for, and hiding it reads as
 * deleted; the row carries the flag and the screen draws it.
 */
export async function getModifierGroups(): Promise<readonly ModifierGroup[] | null> {
  const answer = await apiGet<{ data?: readonly ApiModifierGroup[] }>('/menu/modifier-groups');

  if (!answer?.data) return null;

  return answer.data.map((group) => ({
    id: String(group.id),
    // Already resolved for the reader's language by the API's own
    // HasTranslations — the console never sees the jsonb column here.
    name: group.title ?? '—',
    min: group.min_choices,
    max: group.max_choices,
    usedBy: group.used_by ?? 0,
    active: group.is_active,
    options: (group.choices ?? []).map((choice) => ({
      id: String(choice.id),
      name: choice.title ?? '—',
      price: choice.price_delta_tiyin,
    })),
  }));
}
