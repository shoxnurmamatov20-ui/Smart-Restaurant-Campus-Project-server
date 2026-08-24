/**
 * The menu, as both guest surfaces hold it.
 *
 * Types and pure helpers only — no `fetch`, no `next/headers`. The QR menu is a
 * client component and imports values from here, so anything server-only in
 * this module would end up in the browser bundle and fail the build. The half
 * that talks to the API is the sibling `guest-menu-server.ts`, which only
 * server components import. That split is a house rule and this file is the
 * reason it exists twice over: `@/lib/api-server` reads cookies at module
 * scope.
 *
 * One shape for two surfaces on purpose. The QR menu and the restaurant site
 * read the **same** endpoint — `GET /api/v1/public/menu` — and the API is what
 * guarantees they agree about what is on sale. Neither screen decides
 * availability for itself: a dish the kitchen has 86'd is simply not in the
 * payload, including under a sub-heading, and a screen that filtered on its own
 * would eventually disagree with the kitchen in the guest's favour.
 */

import { dishImageFrom, type DishImage, type ImagePayload } from '../media/image';

/** The `{uz, ru, en}` column every user-facing name is stored in. */
export type Translated = Partial<Record<'uz' | 'ru' | 'en', string>>;

/** The three languages a guest surface speaks. */
export type GuestLocale = 'uz' | 'ru' | 'en';

/**
 * Read a translated column for a reader.
 *
 * Falls through to whichever language is present rather than rendering an empty
 * line: a dish named only in Uzbek should still be legible to someone reading
 * in English, and a blank row on a menu is worse than a foreign one.
 *
 * A local copy of `@/lib/api-server`'s `translate` rather than an import of it,
 * because that module reads `next/headers` at the top level and this one is
 * imported by client components.
 */
export function translate(
  value: Translated | string | null | undefined,
  locale: GuestLocale,
): string {
  if (typeof value === 'string') return value;
  if (!value) return '';

  return value[locale] ?? value.uz ?? value.ru ?? value.en ?? '';
}

/**
 * One dish, with everything a guest is entitled to know before ordering it.
 *
 * `price` is tiyin, like every other amount in this system. `allergens` is a
 * list rather than a sentence because the design renders it twice at two
 * lengths — a one-line warning on the menu row, a bordered block on the dish
 * sheet — and joining it early would leave the second one unable to break it up
 * again.
 */
export type GuestDish = {
  id: string;
  /** Resolved for the reader's language by the API, or by `translate` here. */
  name: string;
  description: string;
  /** Tiyin. Includes VAT — DECISIONS Q1. */
  price: number;
  weightGrams: number | null;
  calories: number | null;
  allergens: readonly string[];
  vegetarian: boolean;
  /** `spice_level` above zero. The design shows one badge, not a scale. */
  spicy: boolean;
  /**
   * One address, for the readers that want one — the largest size the
   * platform holds, or the address a restaurant typed in. Kept beside `image`
   * because the JSON-LD menu and the cart line want a string, not a set.
   */
  imageUrl: string | null;
  /**
   * The photograph at every size, with a placeholder to paint first — see
   * `media/image.ts`. The menu row draws `thumb`, the sheet draws `full`, and
   * a browser chooses between them from `srcSet`. Null when there is none.
   */
  image: DishImage | null;
  categoryId: string;
  /**
   * On the menu, but not tonight.
   *
   * The design dims the row, chips it "Bugun tugadi" and takes the add button
   * away rather than removing the dish — a guest who came for the somsa is
   * owed the word "finished", not a menu that silently no longer has one.
   *
   * `GET /api/v1/public/menu` marks rather than drops: `flagStopped()` sends
   * the 86'd dish down in its own place with `is_available: false` and
   * `is_stopped: true`. It used to drop them, which is why the screens were
   * built for a flag that never arrived; they are right as they stand.
   */
  soldOut: boolean;
  /**
   * What the kitchen asks before it will cook this — sizes, extras, "no onion".
   *
   * Undefined rather than an empty list when a dish carries no questions, so a
   * screen can tell "this kitchen asks nothing about this plate" from "these
   * are the four demo extras". That distinction is what decides whether the
   * sheet may offer `DISH_ADDONS` (`guest/table-data.ts`) — see the note there.
   *
   * The ids are the catalogue's own, which is the entire point of reading them:
   * `POST /api/v1/public/tables/{table}/order` prices every choice through
   * `MenuCatalog`, so a word where an id belongs is refused for the whole
   * basket.
   */
  groups?: readonly GuestModifierGroup[];
};

/** One question on the dish sheet, resolved for the reader. */
export type GuestModifierGroup = {
  id: string;
  /** Already in the reader's language. */
  title: string;
  /** Whether more than one answer may be picked. */
  multi: boolean;
  /** How many answers are required, and how many are allowed. */
  min: number;
  max: number;
  choices: readonly GuestModifierChoice[];
};

/** One answer to that question. */
export type GuestModifierChoice = {
  id: string;
  /** Already in the reader's language. */
  name: string;
  /**
   * Tiyin, added once to the unit price.
   *
   * Signed: "no onion" is worth nothing and a small cup is worth less than
   * nothing, which is why the column is called `price_delta_tiyin`.
   */
  price: number;
};

/** A heading and what is under it. Sub-categories arrive as their own entry. */
export type GuestCategory = {
  id: string;
  name: string;
  dishes: readonly GuestDish[];
};

/**
 * What a guest screen renders.
 *
 * `live` is the honest half. `false` means the API did not answer and these are
 * the fixtures the screen was built against — a menu a guest can read but must
 * not order from, and the screens say so. Hiding that would let a phone quote a
 * price the kitchen never set.
 */
export type GuestMenu = {
  restaurant: { name: string; slug: string } | null;
  categories: readonly GuestCategory[];
  live: boolean;
};

/** Every dish across every heading, in menu order. */
export function allDishes(menu: GuestMenu): readonly GuestDish[] {
  return menu.categories.flatMap((category) => category.dishes);
}

/** One dish by id, or `null` — never a throw on a URL somebody typed. */
export function dishById(menu: GuestMenu, id: string): GuestDish | null {
  return allDishes(menu).find((dish) => dish.id === id) ?? null;
}

/**
 * Search, the way a guest expects it.
 *
 * Name and description, case-insensitive, no ranking. The design's own filter
 * does exactly this and a smarter one would be a different feature: on a menu
 * of tens of items, a guest typing "osh" wants every row containing it, in the
 * order the kitchen put them in.
 */
export function searchDishes(dishes: readonly GuestDish[], query: string): readonly GuestDish[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return dishes;

  return dishes.filter(
    (dish) =>
      dish.name.toLowerCase().includes(needle) || dish.description.toLowerCase().includes(needle),
  );
}

/**
 * The grams line the design prints beside a price — `380 g`.
 *
 * A unit, not copy: `g` is `g` in all three languages, and the number is a
 * number. Litres would be a different unit and the API does not carry one, so a
 * drink's weight is simply absent rather than invented.
 */
export function weightLabel(dish: GuestDish): string | null {
  return dish.weightGrams === null ? null : `${dish.weightGrams} g`;
}

/** `690 kcal`, or nothing when the recipe card has not been costed. */
export function caloriesLabel(dish: GuestDish): string | null {
  return dish.calories === null ? null : `${dish.calories} kcal`;
}

/**
 * What `PublicMenuController` sends, narrowed to what a guest screen draws.
 *
 * `GET /api/v1/public/menu` is the one endpoint the platform publishes to the
 * public, and both guest clients — the browser and the phone — ask it the same
 * question. So the translation from its payload into {@link GuestMenu} lives
 * here rather than beside either client: two mappings of one payload is how the
 * phone ends up believing a dish is vegetarian and the browser does not.
 *
 * Pure by construction — no `fetch`, no headers, no cache. The caller does the
 * request (`apps/web/.../guest-menu-server.ts` on the server, `src/guest/menu.ts`
 * on the phone) and hands the parsed body here.
 */
export type GuestMenuItemPayload = {
  id: number | string;
  /** Already resolved for the requested `X-Locale` by the API. */
  title?: string | null;
  name?: Translated | string | null;
  description?: Translated | string | null;
  price: number;
  weight_grams?: number | null;
  calories?: number | null;
  allergens?: readonly string[] | null;
  is_vegetarian?: boolean;
  is_available?: boolean;
  spice_level?: number;
  image_url?: string | null;
  /** `ImageSet::toArray()` — the platform's own sizes, or null. */
  image?: ImagePayload | null;
  /**
   * The sheet a phone draws when a dish is tapped — sizes, extras, "no onion".
   *
   * `GET /api/v1/public/menu` has always published it, eager-loaded per dish so
   * that opening a dish costs no second request. Nothing read it: both guest
   * surfaces were built against fixture extras whose ids are words, and words
   * are refused by the ordering endpoint, which prices every choice through
   * `MenuCatalog`. `toGuestGroups()` below is that gap closed.
   */
  modifier_groups?: readonly GuestModifierGroupPayload[] | null;
};

/** One question on that sheet, as `ModifierGroupResource` writes it. */
export type GuestModifierGroupPayload = {
  id: number | string;
  /** Already resolved for the requested `X-Locale` by the API. */
  title?: string | null;
  name?: Translated | string | null;
  is_multi?: boolean;
  min_choices?: number | null;
  max_choices?: number | null;
  choices?: readonly GuestModifierChoicePayload[] | null;
};

/** One answer to that question. `price_delta_tiyin` may be negative. */
export type GuestModifierChoicePayload = {
  id: number | string;
  /** Already resolved for the requested `X-Locale` by the API. */
  title?: string | null;
  name?: Translated | string | null;
  price_delta_tiyin?: number | null;
};

export type GuestMenuCategoryPayload = {
  id: number | string;
  title?: string | null;
  name?: Translated | string | null;
  children?: readonly GuestMenuCategoryPayload[];
  items?: readonly GuestMenuItemPayload[];
};

export type GuestMenuPayload = {
  restaurant?: { name?: string | null; slug?: string | null } | null;
  data?: readonly GuestMenuCategoryPayload[];
};

function toGuestDish(
  item: GuestMenuItemPayload,
  categoryId: string,
  locale: GuestLocale,
): GuestDish {
  return {
    id: String(item.id),
    /*
     * `title` first: the API has already resolved the locale map against the
     * request's language, and re-resolving `name` here would answer a different
     * question — what this client thinks the language is, rather than what the
     * server was asked for. They agree today, and the `X-Locale` header is what
     * makes them agree.
     */
    name: item.title ?? translate(item.name, locale),
    description: translate(item.description, locale),
    price: item.price,
    weightGrams: item.weight_grams ?? null,
    calories: item.calories ?? null,
    allergens: item.allergens ?? [],
    vegetarian: item.is_vegetarian === true,
    // The API grades heat 0..3 and the design draws one badge. Anything above
    // plain is spicy, which is the distinction a guest acts on.
    spicy: (item.spice_level ?? 0) > 0,
    imageUrl: item.image_url ?? null,
    image: dishImageFrom(item.image, item.image_url),
    // See `GuestDish.soldOut`: the endpoint marks the 86'd dish in its place
    // rather than dropping it, and this is the flag it marks with.
    soldOut: item.is_available === false,
    categoryId,
    groups: toGuestGroups(item.modifier_groups, locale),
  };
}

/**
 * The kitchen's own questions, or undefined when it asks none.
 *
 * A group with no choices is dropped rather than drawn empty: it is a question
 * with no answers, and a required one would be a sheet a guest cannot get past.
 * Undefined rather than `[]` when nothing survives, because the sheet reads the
 * difference — see `GuestDish.groups`.
 */
function toGuestGroups(
  groups: readonly GuestModifierGroupPayload[] | null | undefined,
  locale: GuestLocale,
): readonly GuestModifierGroup[] | undefined {
  if (!Array.isArray(groups) || groups.length === 0) return undefined;

  const mapped = groups
    .map((group): GuestModifierGroup => {
      const choices = (group.choices ?? []).map(
        (choice: GuestModifierChoicePayload): GuestModifierChoice => ({
          // A string, and the catalogue's own number underneath it. The screens
          // key on strings; the ordering endpoint takes the integers back.
          id: String(choice.id),
          name: choice.title ?? translate(choice.name, locale),
          price: choice.price_delta_tiyin ?? 0,
        }),
      );

      return {
        id: String(group.id),
        title: group.title ?? translate(group.name, locale),
        multi: group.is_multi === true,
        min: Math.max(0, group.min_choices ?? 0),
        /*
         * Zero means "as many as you like" in the column and would mean "none
         * at all" to a screen counting against it, so it becomes the number of
         * choices — the same ceiling, said in the screen's terms.
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
 * Flatten the tree the API sends into the one row of chips the design draws.
 *
 * A root category and each of its children become their own heading. The
 * nesting is real — a restaurant groups "Salads" under "Cold starters" — but a
 * phone has one rail and a second level would put a heading behind a tap nobody
 * makes. A heading with nothing under it is dropped rather than drawn empty.
 */
function toGuestCategories(
  categories: readonly GuestMenuCategoryPayload[],
  locale: GuestLocale,
): readonly GuestCategory[] {
  const flat: GuestCategory[] = [];

  for (const category of categories) {
    const id = String(category.id);
    const dishes = (category.items ?? []).map((item) => toGuestDish(item, id, locale));

    if (dishes.length > 0) {
      flat.push({ id, name: category.title ?? translate(category.name, locale), dishes });
    }

    for (const child of category.children ?? []) {
      const childId = String(child.id);
      const childDishes = (child.items ?? []).map((item) => toGuestDish(item, childId, locale));

      if (childDishes.length > 0) {
        flat.push({
          id: childId,
          name: child.title ?? translate(child.name, locale),
          dishes: childDishes,
        });
      }
    }
  }

  return flat;
}

/**
 * The payload, as a screen holds it — or `null` when it is not a menu.
 *
 * `null` rather than an empty menu on a malformed body, because the two mean
 * opposite things to a guest: an empty menu is a restaurant with no food on
 * sale, and a malformed body is a server that did not answer. Only the caller
 * knows which sentence to show, and it cannot tell them apart afterwards.
 */
export function guestMenuFrom(
  payload: GuestMenuPayload,
  tenant: string,
  locale: GuestLocale,
): GuestMenu | null {
  if (!Array.isArray(payload.data)) return null;

  return {
    restaurant: {
      name: payload.restaurant?.name ?? tenant,
      slug: payload.restaurant?.slug ?? tenant,
    },
    categories: toGuestCategories(payload.data, locale),
    live: true,
  };
}
