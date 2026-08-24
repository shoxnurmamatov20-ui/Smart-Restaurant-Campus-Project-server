import { cache } from 'react';

import { apiBase } from '@/lib/server-session';

import {
  BRANCHES,
  preOrderSlots,
  VENUE,
  type CartVenue,
  type SiteLocale,
  type SiteOptionGroup,
  type VenueBranch,
} from './venue-data';

/**
 * The restaurant's own website, from the restaurant's own record.
 *
 * Server half of ./venue-data.ts, split per the house rule: types and fixtures
 * in `*-data.ts`, anything that calls the server in a sibling only server
 * components import.
 *
 * This one does NOT go through `@/lib/api-server`, and the difference is the
 * whole reason it exists. `apiGet` reads a session cookie and sends a bearer
 * token; the reader here has neither — they are a stranger who followed a link,
 * and there is no account behind them. So the request is the same shape the QR
 * menu makes: `X-Tenant` in a header, no credential, and an endpoint that
 * publishes only what is already printed on the door.
 *
 * Falling back to the fixtures is not a nicety here either. `/r/{slug}` is the
 * one indexable surface on the platform: a page that 500s while the API
 * restarts is a page Google records as broken.
 *
 * ---------------------------------------------------------------------------
 * Three endpoints, three jobs, and why they are not one
 *
 *   `public/site`      the shop window — name, branches, hours, telephone, and
 *                      the accent the venue picked. Read by every screen here.
 *   `public/branches`  the same venues with their **numeric ids** and their
 *                      delivery settings. The checkout needs those: an order
 *                      names a branch by id, and `public/site` deliberately
 *                      publishes the slug instead because a shop window has no
 *                      business handing out primary keys.
 *   `public/menu`      the catalogue, read here only for the `modifier_groups`
 *                      the dish sheet prices a portion from. The menu itself
 *                      comes through `(guest)/guest-menu-server`, which both
 *                      guest surfaces share.
 */

/** What `GET /api/v1/public/site` answers. */
type ApiSite = {
  data: {
    name: string;
    slug: string;
    site: {
      headline?: string;
      subheadline?: string;
      about?: string;
      phone?: string;
      instagram?: string;
      telegram?: string;
      accent?: string;
      sections?: Record<string, boolean>;
      /**
       * Which doors this website's own order form offers.
       *
       * NOT the four fulfilment channels an order row can hold — see
       * `config/settings.php`, which spends a paragraph on the difference. A
       * restaurant that delivers but takes delivery orders by telephone only is
       * a real arrangement, and this is where it says so.
       */
      channels?: string[];
      /** How far ahead the form lets somebody choose a time, and in what steps. */
      preorder?: {
        enabled?: boolean;
        lead_minutes?: number;
        horizon_days?: number;
        slot_minutes?: number;
      };
    };
    branches: {
      id: string;
      name: string;
      city: string | null;
      address: string | null;
      phone: string | null;
      hours: Record<string, { open?: string; close?: string; closed?: boolean }>;
      bookable: boolean;
    }[];
  };
};

/** What the site draws, whether it came from the API or from the fixtures. */
export type Venue = {
  name: string;
  /** The eight sections, or null where the restaurant has never configured them. */
  sections: Record<string, boolean> | null;
  accent: string | null;
  headline: string | null;
  about: string | null;
  /**
   * The restaurant's published telephone and Telegram, or null for neither.
   *
   * Null rather than the demo's. See `VenueBranch.phone`: this is the one
   * indexable surface on the platform, and a fallback here publishes the sample
   * restaurant's number on a real venue's website.
   */
  phone: string | null;
  telegram: string | null;
  branches: readonly VenueBranch[];
  /** False when this render is the demo venue rather than a real one. */
  live: boolean;
};

/** How long a page waits for the API before drawing the fixtures instead. */
const TIMEOUT_MS = 4_000;

/**
 * One `public/site` read per render, whoever asks.
 *
 * `cache()` is React's request-scoped memo, not a response cache: the layout
 * asks for the accent, the page asks for the branches and the header asks for
 * the name, and without this every screen would make the same call three times
 * on the one surface that is served to anonymous readers at scale.
 *
 * Keyed on the slug alone and deliberately sent with no `X-Locale`. Nothing in
 * this payload is translated — a restaurant's name is a proper noun, and its
 * address, telephone and hours are what is printed on the door in whatever
 * language the door is in. Adding the locale to the key would triple the number
 * of calls to buy nothing.
 */
const fetchSite = cache(async (restaurant: string, path = '/'): Promise<ApiSite['data'] | null> => {
  try {
    /*
     * `?path=` is what makes the console's traffic panel a list of pages
     * rather than one number. Both call sites in a page — `generateMetadata`
     * and the body — pass the same value, so React's request memo keeps them
     * one request and the visit is counted once.
     */
    const response = await fetch(`${apiBase()}/public/site?path=${encodeURIComponent(path)}`, {
      headers: { Accept: 'application/json', 'X-Tenant': restaurant },
      // Per restaurant and per render. A cached response here would be one
      // venue's opening hours served for another's slug.
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const body = (await response.json()) as ApiSite;

    return body.data ?? null;
  } catch {
    return null;
  }
});

/**
 * One restaurant's public face.
 *
 * `restaurant` is the slug from the path — `/r/osh-xona` — which is how a
 * stranger's request says which tenant it is for. Getting that wrong would show
 * one restaurant's address to another's guests, on the one surface with no
 * login to catch it, so it is passed explicitly rather than inferred.
 *
 * No locale argument, unlike every other read on this surface: see `fetchSite`
 * for why this payload has nothing in it to translate.
 */
export async function fetchVenue(restaurant: string, path = '/'): Promise<Venue> {
  const data = await fetchSite(restaurant, path);

  if (data === null) return demoVenue();

  return {
    name: data.name,
    sections: data.site.sections ?? null,
    accent: data.site.accent ?? null,
    headline: data.site.headline ?? null,
    about: data.site.about ?? null,
    phone: data.site.phone ?? null,
    telegram: data.site.telegram ?? null,
    branches: data.branches.map((branch): VenueBranch => ({
      id: branch.id,
      name: branch.name,
      /*
       * The address is one string on the server and three on the site.
       *
       * A venue types its address once, in the language it trades in, and
       * translating it would be inventing a street name. So the same
       * string goes in all three slots and `say()` returns it whichever
       * language the reader is in — which is what a person standing in
       * front of the building would read on the door.
       */
      address: { uz: branch.address ?? '', ru: branch.address ?? '', en: branch.address ?? '' },
      phone: branch.phone ?? null,
      /*
       * The venue's own hours, or nothing. `09:00 – 23:00` used to be written
       * onto every branch that had not published any, so a site said a
       * restaurant was open at nine on a morning it does not trade.
       */
      opens: branch.hours?.mon?.open ?? null,
      closes: branch.hours?.mon?.close ?? null,
      /*
       * Neither is published: delivery windows belong to Orders and pickup
       * timing to the kitchen, and `GET /public/site` carries neither. Null,
       * so the site draws nothing — the design's `35–50` was a promise about
       * how long a stranger waits for food from a kitchen nobody had asked.
       */
      deliveryEta: null,
      pickupMinutes: null,
      bookable: branch.bookable,
    })),
    live: true,
  };
}

/**
 * Which of the four accents this restaurant picked.
 *
 * `settings.site.accent` — `config/settings.php` validates it `in:a0,a1,a2,a3`
 * and `/settings/site` is where a venue chooses, so the value is already one of
 * the four the stylesheet defines. Checked again here anyway: this string goes
 * straight into a DOM attribute, and one that matched no rule would render as
 * no accent at all — saved, acknowledged and invisible, which is the worst way
 * for a setting to be wrong.
 *
 * `a1` when the venue has never chosen, rather than the `:root` seed. The seed
 * is the platform's clinical blue, and a restaurant's own website wearing the
 * software vendor's colour is the failure this attribute exists to prevent.
 */
export type Accent = 'a0' | 'a1' | 'a2' | 'a3';

const ACCENTS: readonly Accent[] = ['a0', 'a1', 'a2', 'a3'];

export async function fetchVenueAccent(restaurant: string): Promise<Accent> {
  const picked = (await fetchSite(restaurant))?.site.accent;

  return ACCENTS.find((accent) => accent === picked) ?? 'a1';
}

/**
 * The venues a guest may actually order from — `GET /api/v1/public/branches`.
 *
 * Its own read rather than a field on `fetchVenue`, because it answers a
 * different question and carries something the shop window must not: the
 * branch's row id. `POST /api/v1/public/orders` names a venue by that id and
 * refuses a chain that does not name one (`order.branch_unavailable`), so a
 * collection order placed from a five-branch restaurant needs it or it cannot
 * be placed at all.
 *
 * Empty when the API did not answer, and the caller falls back to `BRANCHES` —
 * a list with no ids, which is exactly what a checkout that cannot reach the
 * kitchen should have: it can draw the choice and it cannot pretend to send it.
 */
export type OrderVenue = {
  /** The row id. Sent as `branch_id`; never rendered. */
  apiId: number;
  slug: string;
  name: string;
  address: string;
  /** Tiyin, from `branches.settings['delivery.fee_tiyin']`. */
  deliveryFee: number;
  /** Tiyin. The API refuses a basket under it — `order.below_minimum`. */
  minOrder: number;
  delivers: boolean;
  opens: string;
  closes: string;
  /** The venue's own clock — the one the pre-order sittings are counted on. */
  timezone: string;
};

type ApiBranches = {
  data: {
    id: number;
    slug: string;
    name: string;
    city: string | null;
    address: string | null;
    timezone: string | null;
    opens: string | null;
    closes: string | null;
    delivers: boolean;
    delivery_fee_tiyin: number;
    min_order_tiyin: number;
  }[];
};

/**
 * The branches a stranger may order from — or `null` when nobody answered.
 *
 * The two are kept apart deliberately, and it is the whole fix here. This used
 * to answer `[]` for a network failure AND for a restaurant that has published
 * no branch, so the checkout could not tell them apart and treated both as
 * "fall back to the design" — which offered a guest on a real restaurant's site
 * the demo's five Tashkent and Termiz venues, with their street addresses. The
 * button then failed silently, because a fixture venue carries no `apiId`.
 *
 * `null` is "we do not know" and takes the fixture. `[]` is "this restaurant is
 * not open for ordering", which is a true sentence a page can print.
 */
export const fetchOrderVenues = cache(
  async (restaurant: string): Promise<readonly OrderVenue[] | null> => {
    try {
      const response = await fetch(`${apiBase()}/public/branches`, {
        headers: { Accept: 'application/json', 'X-Tenant': restaurant },
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) return null;

      const body = (await response.json()) as ApiBranches;

      return (body.data ?? []).map((branch) => ({
        apiId: branch.id,
        slug: branch.slug,
        name: branch.name,
        address: branch.address ?? branch.city ?? '',
        deliveryFee: branch.delivery_fee_tiyin,
        minOrder: branch.min_order_tiyin,
        delivers: branch.delivers,
        opens: branch.opens ?? '09:00',
        closes: branch.closes ?? '23:00',
        timezone: branch.timezone ?? 'Asia/Tashkent',
      }));
    } catch {
      return null;
    }
  },
);

/**
 * The venues the checkout draws, folded to one shape and one clock.
 *
 * Assembled here rather than on the screen for two reasons, and the second is
 * the one that would otherwise be found in a browser console:
 *
 *   **The fallback belongs to the server.** Live venues carry row ids and no
 *   pickup timing; the fixtures carry the design's timings and no ids. The
 *   screen must not have to know which list it is holding — it renders one and
 *   refuses to place an order against a venue with no `apiId`.
 *
 *   **The sittings are time-dependent, and this component is server-rendered
 *   before it hydrates.** Computing "which hours are still ahead" in the client
 *   would produce one list on the server and a different one a second later in
 *   the browser, which React reports as a hydration mismatch and a reader sees
 *   as a select that flickers. Resolved once, here, and passed down.
 *
 * Each venue's own timezone, not the reader's and not the server's: a guest in
 * London ordering from Termiz is ordering into Termiz's evening.
 */
export async function fetchCheckoutVenues(restaurant: string): Promise<readonly CartVenue[]> {
  const [live, rules] = await Promise.all([
    fetchOrderVenues(restaurant),
    fetchOrderingRules(restaurant),
  ]);

  /*
   * The fixture only when nobody answered. A live restaurant with no branch
   * published gets an empty list and the checkout says ordering is not open —
   * see `fetchOrderVenues`.
   */
  if (live === null) {
    return BRANCHES.map((branch) => ({
      id: branch.id,
      // No id, so the checkout can draw this venue and cannot send an order to
      // it. See `CartVenue`.
      apiId: null,
      name: branch.name,
      address: branch.address,
      pickupMinutes: branch.pickupMinutes,
      deliveryEta: branch.deliveryEta,
      delivers: true,
      deliveryFee: null,
      /* A restaurant that has switched pre-ordering off offers "as soon as
         possible" alone — an empty list is what the select falls back to. */
      slots: rules.preorder.enabled
        ? preOrderSlots(branch, clockIn('Asia/Tashkent'), rules.preorder.leadMinutes)
        : [],
    }));
  }

  return live.map((venue) => ({
    id: venue.slug,
    apiId: venue.apiId,
    name: venue.name,
    /* One string on the server and three on the site — see `fetchVenue`. A
       venue types its address in the language it trades in, and translating it
       would be inventing a street name. */
    address: { uz: venue.address, ru: venue.address, en: venue.address },
    /* Neither is published: pickup timing belongs to the kitchen and a delivery
       window to Orders. The design's own figures stand in rather than a guess
       computed from nothing — the same stand-ins `fetchVenue` uses. */
    pickupMinutes: 20,
    deliveryEta: '35–50',
    delivers: venue.delivers,
    deliveryFee: venue.deliveryFee,
    slots: rules.preorder.enabled
      ? preOrderSlots(venue, clockIn(venue.timezone), rules.preorder.leadMinutes)
      : [],
  }));
}

/**
 * What the site's own order form offers, as the restaurant configured it.
 *
 * `settings.site.channels` and `settings.site.preorder` — read from the
 * PUBLISHED snapshot like everything else on this surface, so a marketer
 * halfway through changing them has not changed them for anybody yet.
 *
 * Defaults are what a restaurant that has never opened the settings screen
 * means: both doors open, and pre-ordering on with an hour's lead. Turning
 * something off is a decision somebody made; never having decided is not.
 */
export async function fetchOrderingRules(restaurant: string): Promise<{
  channels: readonly string[];
  preorder: { enabled: boolean; leadMinutes: number };
}> {
  const site = (await fetchSite(restaurant))?.site;
  const channels = site?.channels;
  const preorder = site?.preorder;

  return {
    channels: Array.isArray(channels) && channels.length > 0 ? channels : ['delivery', 'pickup'],
    preorder: {
      enabled: preorder?.enabled !== false,
      // Sixty is `preOrderSlots`' own default and the design's assumption: a
      // kitchen offered a sitting it cannot cook for is a kitchen that will
      // miss it.
      leadMinutes:
        typeof preorder?.lead_minutes === 'number' && preorder.lead_minutes >= 0
          ? preorder.lead_minutes
          : 60,
    },
  };
}

/** `HH:MM` right now, on somebody else's clock. */
function clockIn(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
  } catch {
    // A zone the runtime does not know. Falling back to the server's clock is
    // wrong by hours; falling back to the platform's own is wrong by minutes.
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tashkent',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
  }
}

/**
 * The questions each dish asks, from the catalogue the guest is reading.
 *
 * `GET /api/v1/public/menu` eager-loads `modifier_groups` per dish with their
 * active choices, resolved for `X-Locale` — so a size costs what this kitchen
 * charges for it and carries the option id the ordering endpoint prices a line
 * by. Before this the sheet surcharged every sharing plate by the design's
 * +75% and offered four add-ons at the design's prices, on every restaurant on
 * the platform.
 *
 * Keyed by dish id as a string, because everything else on this surface
 * identifies a dish with one. A dish with no groups is simply absent from the
 * map and its sheet falls back to `PORTIONS` and `ADDONS`.
 *
 * `channel=delivery` matches what the site sells: `forChannel()` hides a dish a
 * venue only serves in the room, and a sheet offering a size for a dish the
 * checkout cannot order is a sheet that ends in a 422.
 */
type ApiMenuGroups = {
  data?: {
    items?: ApiMenuItem[];
    children?: { items?: ApiMenuItem[] }[];
  }[];
};

type ApiMenuItem = {
  id: number | string;
  modifier_groups?: {
    id: number | string;
    title: string;
    is_multi: boolean;
    min_choices: number | null;
    max_choices: number | null;
    choices?: { id: number | string; title: string; price_delta_tiyin: number }[];
  }[];
};

export const fetchDishOptions = cache(
  async (
    restaurant: string,
    locale: SiteLocale,
  ): Promise<ReadonlyMap<string, readonly SiteOptionGroup[]>> => {
    const sheets = new Map<string, readonly SiteOptionGroup[]>();

    try {
      const response = await fetch(`${apiBase()}/public/menu?channel=delivery`, {
        headers: { Accept: 'application/json', 'X-Tenant': restaurant, 'X-Locale': locale },
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) return sheets;

      const body = (await response.json()) as ApiMenuGroups;

      for (const category of body.data ?? []) {
        // A sub-heading's dishes are a level down and are just as orderable.
        // Missing them would leave every dish under one silently unpriced.
        const items = [
          ...(category.items ?? []),
          ...(category.children ?? []).flatMap((child) => child.items ?? []),
        ];

        for (const item of items) {
          const groups = groupsOf(item);

          if (groups.length > 0) sheets.set(String(item.id), groups);
        }
      }

      return sheets;
    } catch {
      return sheets;
    }
  },
);

/** One dish's sheet, dropping any group the kitchen left with no choices in it. */
function groupsOf(item: ApiMenuItem): readonly SiteOptionGroup[] {
  return (item.modifier_groups ?? [])
    .map((group) => ({
      id: String(group.id),
      title: group.title,
      multi: group.is_multi,
      min: group.min_choices ?? 0,
      max: group.max_choices,
      choices: (group.choices ?? []).map((choice) => ({
        id: String(choice.id),
        title: choice.title,
        priceDelta: choice.price_delta_tiyin,
      })),
    }))
    .filter((group) => group.choices.length > 0);
}

/** The design's venue, for a render with no API behind it. */
function demoVenue(): Venue {
  return {
    name: VENUE.name,
    sections: null,
    accent: null,
    headline: null,
    about: null,
    phone: VENUE.phone,
    telegram: VENUE.telegram,
    branches: BRANCHES,
    live: false,
  };
}

/**
 * The instant behind each sitting the checkout offers.
 *
 * `preOrderSlots()` answers labels — `19:00` — because that is what a guest
 * reads. `PublicOrderRequest` wants `scheduled_for`, which is a moment in time,
 * and turning a label into one in the browser would use the READER's clock: a
 * guest in Berlin choosing 19:00 for a Termiz kitchen would book four hours
 * after service.
 *
 * So the conversion happens here, where the venue's own timezone is known, and
 * the ISO string carries an explicit offset rather than a `Z`. Today's offset
 * is resolved from the runtime's own zone data rather than assumed — Uzbekistan
 * has no daylight saving and several of this platform's future markets do.
 *
 * Keyed venue → label → instant, so the checkout looks up exactly what it drew.
 *
 * @returns `{ 'chilonzor': { '19:00': '2026-08-22T19:00:00+05:00' } }`
 */
export async function fetchSlotInstants(
  restaurant: string,
): Promise<Readonly<Record<string, Readonly<Record<string, string>>>>> {
  const [venues, rules] = await Promise.all([
    fetchOrderVenues(restaurant),
    fetchOrderingRules(restaurant),
  ]);
  const out: Record<string, Record<string, string>> = {};

  for (const venue of venues ?? []) {
    const zone = venue.timezone;
    const day = dayIn(zone);
    const offset = offsetOf(zone);
    const slots: Record<string, string> = {};

    const labels = rules.preorder.enabled
      ? preOrderSlots(venue, clockIn(zone), rules.preorder.leadMinutes)
      : [];

    for (const label of labels) {
      slots[label] = `${day}T${label}:00${offset}`;
    }

    out[venue.slug] = slots;
  }

  return out;
}

/** `YYYY-MM-DD` today, on somebody else's clock. */
function dayIn(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
  }
}

/**
 * `+05:00` for a zone, today.
 *
 * `longOffset` answers `GMT+05:00`; the ISO wants the tail of it. A runtime old
 * enough not to know the option answers something else, and Tashkent's offset
 * is the honest fallback for a platform whose venues are all in it.
 */
function offsetOf(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date());

    const name = parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
    const match = /GMT([+-]\d{2}:\d{2})/.exec(name);

    return match?.[1] ?? '+05:00';
  } catch {
    return '+05:00';
  }
}
