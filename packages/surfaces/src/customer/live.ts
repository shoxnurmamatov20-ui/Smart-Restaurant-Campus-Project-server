import type {
  GuestMenuCategoryPayload,
  GuestMenuItemPayload,
  GuestMenuPayload,
  GuestModifierChoicePayload,
  GuestModifierGroupPayload,
  Translated,
} from '../guest/menu-data';

import { dishImageFrom } from '../media/image';
import {
  BRANCHES,
  CATEGORIES,
  DISHES,
  type Branch,
  type Category,
  type Dish,
  type Lang,
  type Modifier,
  type ModifierGroup,
  type Trilingual,
} from './data';

/**
 * The customer app's menu, from the one endpoint the platform publishes.
 *
 * `GET /api/v1/public/menu` — the same payload the QR menu and the restaurant
 * site read. One endpoint and one mapping, because the alternative is what
 * `pricing.ts` already warned about: two readers of one menu drift, and the way
 * that shows up is a phone quoting a price the kitchen never set.
 *
 * Pure by construction — no `fetch`, no `next/*`, no DOM. `purity.test.ts`
 * enforces it. The request belongs to the caller:
 * `apps/web/.../customer-server.ts` on the server, `src/customer/live.ts` on the
 * phone, and both hand the parsed body here.
 *
 * ---------------------------------------------------------------------------
 * What the API does not have, and what this does about it
 *
 * `rating` and `reviews` exist in the fixtures and in no column. There is no
 * per-dish rating endpoint — CRM stores feedback about a visit, not about a
 * plate — so a live dish comes back with an empty rating and the screens draw
 * nothing rather than "★  (0)". Inventing 4.8 would be the other option and it
 * would be a number a restaurant never earned, printed next to its food.
 */

/** What a customer screen renders, and whether it came from a kitchen. */
export type CustomerMenu = {
  categories: readonly Category[];
  dishes: readonly Dish[];
  /**
   * The honest half. `false` means the API did not answer and these are the
   * fixtures the screens were built against — a menu to read, not to order
   * from, and the screens say so.
   */
  live: boolean;
};

/** The fixtures, as a menu. What every screen falls back to. */
export const DEMO_MENU: CustomerMenu = {
  categories: CATEGORIES,
  dishes: DISHES,
  live: false,
};

/**
 * Fill a `{uz?, ru?, en?}` column out to the three languages a screen needs.
 *
 * A dish named only in Uzbek stays legible to a reader in English — a blank
 * row on a menu is worse than a foreign one, and the fallback order is the same
 * one `guest/menu-data.ts` uses so the two guest surfaces read alike.
 */
function trilingual(value: Translated | string | null | undefined, fallback: string): Trilingual {
  if (typeof value === 'string') return { uz: value, ru: value, en: value };

  const uz = value?.uz ?? value?.ru ?? value?.en ?? fallback;

  return {
    uz,
    ru: value?.ru ?? uz,
    en: value?.en ?? uz,
  };
}

function toDish(item: GuestMenuItemPayload, categoryId: string): Dish {
  const name = trilingual(item.name, item.title ?? '');

  return {
    id: String(item.id),
    categoryId,
    name,
    description: trilingual(item.description, ''),
    price: item.price,
    // No column behind either — see the module note. Empty, so a screen can
    // tell "not rated" from "rated zero" and draw neither star nor count.
    rating: '',
    reviews: 0,
    calories: item.calories ?? 0,
    /*
     * The kitchen ran out tonight.
     *
     * `GET /api/v1/public/menu` marks rather than drops: a dish that vanished
     * leaves a guest who came for it asking a waiter what happened, while a
     * dimmed row with "Bugun tugadi" on it is an answer. The endpoint used to
     * drop, which is why every screen here was already built for a flag that
     * never arrived.
     */
    soldOut: item.is_available === false,
    /*
     * The real sheet, with the real ids.
     *
     * Undefined rather than an empty array when a dish has no questions, so a
     * screen can tell "this kitchen asks nothing about this dish" from "these
     * are the demo extras" — the fixtures have no `groups` at all, and that is
     * how a screen knows the basket it is building cannot be ordered.
     */
    groups: toGroups(item.modifier_groups),
    /*
     * The set, not `image_url`. The home tiles, the 74px rows and the 64px
     * basket squares all pick `thumb` or `card` from it; `image_url` is the
     * 1600px file, and a phone that drew thirty rows from it downloaded thirty
     * full-size photographs over mobile data to paint thirty thumbnails.
     */
    image: dishImageFrom(item.image, item.image_url),
  };
}

/**
 * The modifier sheet, or undefined when the dish has none.
 *
 * A group with no choices is dropped rather than drawn empty: it is a question
 * with no answers, and a required one would be a sheet a guest cannot get past.
 */
function toGroups(
  groups: readonly GuestModifierGroupPayload[] | null | undefined,
): readonly ModifierGroup[] | undefined {
  if (!Array.isArray(groups) || groups.length === 0) return undefined;

  const mapped = groups
    .map((group): ModifierGroup => {
      const choices: readonly Modifier[] = (group.choices ?? []).map(
        (choice: GuestModifierChoicePayload) => ({
          id: String(choice.id),
          name: trilingual(choice.name, choice.title ?? ''),
          price: choice.price_delta_tiyin ?? 0,
        }),
      );

      return {
        id: String(group.id),
        title: trilingual(group.name, group.title ?? ''),
        multi: group.is_multi === true,
        min: Math.max(0, group.min_choices ?? 0),
        /*
         * Zero max means "as many as you like" in the column and would mean
         * "none at all" to a screen counting against it, so it becomes the
         * number of choices — the same ceiling, said in the screen's terms.
         */
        max:
          group.max_choices !== null && (group.max_choices ?? 0) > 0
            ? (group.max_choices ?? 0)
            : choices.length,
        choices,
      };
    })
    .filter((group) => group.choices.length > 0);

  return mapped.length > 0 ? mapped : undefined;
}

/**
 * Flatten the tree into the one rail of chips the design draws.
 *
 * A root section and each of its children become their own heading — a phone
 * has one rail, and a second level would put a heading behind a tap nobody
 * makes. A heading with nothing under it is dropped rather than drawn empty.
 */
function collect(
  categories: readonly GuestMenuCategoryPayload[],
  into: { categories: Category[]; dishes: Dish[] },
): void {
  for (const category of categories) {
    const id = String(category.id);
    const dishes = (category.items ?? []).map((item) => toDish(item, id));

    if (dishes.length > 0) {
      into.categories.push({ id, name: trilingual(category.name, category.title ?? id) });
      into.dishes.push(...dishes);
    }

    collect(category.children ?? [], into);
  }
}

/**
 * The payload, as a customer screen holds it — or `null` when it is not a menu.
 *
 * `null` rather than an empty menu on a malformed body, because the two mean
 * opposite things: an empty menu is a restaurant with nothing on sale, and a
 * malformed body is a server that did not answer. Only the caller knows which
 * sentence to show, and it cannot tell them apart afterwards.
 */
export function customerMenuFrom(payload: GuestMenuPayload): CustomerMenu | null {
  if (!Array.isArray(payload.data)) return null;

  const into: { categories: Category[]; dishes: Dish[] } = { categories: [], dishes: [] };
  collect(payload.data, into);

  return { categories: into.categories, dishes: into.dishes, live: true };
}

/** One dish by id, or `null` — never a throw on an id somebody typed. */
export function dishById(menu: CustomerMenu, id: string | null): Dish | null {
  if (id === null) return null;

  return menu.dishes.find((dish) => dish.id === id) ?? null;
}

/**
 * Search, the way a customer expects it.
 *
 * Every language, not just the reader's: a menu is written in three and a
 * person types in one, and somebody reading in Russian still types "osh".
 */
export function searchDishes(
  dishes: readonly Dish[],
  query: string,
  categories: readonly Category[] = [],
): readonly Dish[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return dishes;

  /*
   * The heading counts as well as the dish.
   *
   * `Mijoz ilovasi.dc.html:877-879` spreads the category's three names into the
   * same `.some()` the dish's three go into, and this matched the dish alone —
   * so typing "Ichimliklar" or "Напитки" returned nothing where the drawing
   * returns the whole drinks list. It is the search a person actually performs:
   * "what have they got to drink" is typed as a category, not as a brand.
   *
   * `categories` is optional so the older two-argument call still compiles, and
   * an empty list means the search behaves exactly as it did.
   */
  const matching = new Set(
    categories
      .filter((category) =>
        [category.name.uz, category.name.ru, category.name.en].some((name) =>
          name.toLowerCase().includes(needle),
        ),
      )
      .map((category) => category.id),
  );

  return dishes.filter(
    (dish) =>
      matching.has(dish.categoryId) ||
      [dish.name.uz, dish.name.ru, dish.name.en].some((name) =>
        name.toLowerCase().includes(needle),
      ),
  );
}

/** Everything under one heading, or the whole menu when nothing is chosen. */
export function dishesOf(dishes: readonly Dish[], categoryId: string | null): readonly Dish[] {
  if (categoryId === null) return dishes;

  return dishes.filter((dish) => dish.categoryId === categoryId);
}

/**
 * How often a screen re-asks for the menu.
 *
 * Sixty seconds, matching the endpoint's own cache TTL — asking faster returns
 * the same bytes and the same ETag. This is what makes a stop-list reach a
 * guest: the 86 sheet broadcasts on `branch.{id}.stoplist`, which is a private
 * channel and rightly not open to strangers, so a guest's phone finds out by
 * asking again rather than by being told.
 */
export const MENU_POLL_MS = 60_000;

export type { Lang };

/* ============================================================
   Which venues a guest may order from — GET /api/v1/public/branches
   ============================================================ */

export type GuestBranchPayload = {
  id: number | string;
  name?: string | null;
  city?: string | null;
  address?: string | null;
  delivers?: boolean;
  delivery_fee_tiyin?: number | null;
  min_order_tiyin?: number | null;
  opens?: string | null;
  closes?: string | null;
};

export type GuestBranchEnvelope = { data?: readonly GuestBranchPayload[] };

/** The venues, and whether they came from a restaurant. */
export type CustomerVenues = {
  branches: readonly Branch[];
  live: boolean;
};

/** The fixtures, as a venue list. What every screen falls back to. */
export const DEMO_VENUES: CustomerVenues = { branches: BRANCHES, live: false };

/**
 * The branch list a guest picks from, or `null` when the body is not one.
 *
 * The fee is the reason this endpoint had to exist at all. `BRANCHES` in
 * `data.ts` prices delivery at a flat 12 000 so'm for four venues and 15 000 for
 * the fifth — numbers invented for a demo — while the server derives the fee
 * from `branches.settings['delivery.fee_tiyin']` per venue and recomputes it on
 * the order. A cart quoting one and a bill charging the other is the drift
 * `pricing.ts` already warned about, arriving at the moment a guest is asked to
 * pay.
 *
 * `km` is null on every live venue and that is honest: nothing on this platform
 * knows where the guest is standing. The fixtures carry a distance because a
 * design mock has to draw something.
 */
export function customerVenuesFrom(payload: GuestBranchEnvelope): CustomerVenues | null {
  if (!Array.isArray(payload.data)) return null;

  const branches = payload.data.map((venue): Branch => ({
    id: String(venue.id),
    name: venue.name ?? '',
    address: [venue.city, venue.address].filter((part) => (part ?? '') !== '').join(', '),
    km: null,
    /*
     * Opening hours where the fixtures put a delivery window.
     *
     * The design's chip reads "25–35" minutes, and no column answers that:
     * the promise a guest is given is `promised_at`, computed per basket from
     * the slowest dish, the branch's queue and its travel time. Quoting an
     * average before anything is in the basket would be a number the kitchen
     * never agreed to, so a live venue says when it is open instead.
     */
    eta: [venue.opens, venue.closes].filter((part) => (part ?? '') !== '').join('–'),
    deliveryFee: venue.delivers === false ? 0 : (venue.delivery_fee_tiyin ?? 0),
  }));

  return { branches, live: true };
}
