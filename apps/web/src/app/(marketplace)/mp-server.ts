import { cookies } from 'next/headers';

import {
  MP_ORDER,
  MP_ORDERS,
  STORE_MENU,
  STORES,
  type Lang,
  type MpDish,
  type MpOrder,
  type MpStep,
  type Store,
  type Trilingual,
} from '@restaurant/surfaces/mp/data';
import { dishImageFrom, type ImagePayload } from '@restaurant/surfaces/media/image';
import { MP_SESSION_COOKIE } from '@/lib/mp-cookie';
import { apiBase } from '@/lib/server-session';

/**
 * The marketplace, from the server.
 *
 * Server half of `@restaurant/surfaces/mp/data` — the split every screen on
 * this platform follows: types and fixtures in the data module, server calls in
 * a sibling only server components import. See `tables-server.ts` for why.
 *
 * ---------------------------------------------------------------------------
 * Why this cannot use `apiGet` or `apiPublicGet`
 *
 * Both of the shared readers carry an assumption the marketplace breaks.
 *
 * `apiGet` sends the console session as a bearer and returns `null` when there
 * is no session — so every marketplace read would answer `null` forever, to
 * somebody who has no console account and never will.
 *
 * `apiPublicGet` sends `X-Tenant`, which is right for a restaurant's own QR
 * menu and wrong here by definition: the directory spans forty restaurants and
 * the guest has not chosen one yet. Naming a tenant would answer with one shop.
 *
 * So the fetch is written out. It keeps every property those two have that
 * matters — a timeout, `null` rather than a throw, no partial answers — and
 * differs in the two headers.
 *
 * ---------------------------------------------------------------------------
 * `null` means fixtures, and the screen says so
 *
 * Same contract as everywhere else: a refusal, a timeout or an API mid-restart
 * answers `null`, the caller falls back to the fixture the screen was built
 * against, and nothing throws. A marketplace that 500s because one restaurant's
 * API is restarting is worse than one showing a sample directory.
 */

/** How long a screen waits before drawing fixtures instead. */
const TIMEOUT_MS = 4_000;

/** `GET /api/v1/mp/stores` — one card in the directory. */
type ApiStore = {
  slug: string;
  name: string;
  kind: Trilingual | null;
  cuisine: string;
  vertical: string;
  rating: number;
  reviews_count: number;
  delivery_fee_tiyin: number;
  min_order_tiyin: number;
  minutes_from: number;
  minutes_to: number;
  offer: Trilingual | null;
  offer_tone: string | null;
  is_open: boolean;
  initials: string | null;
  tint: string | null;
  logo_url: string | null;
  cover_url: string | null;
  distance_metres: number | null;
};

/** `GET /api/v1/mp/stores/{slug}` — one row of the market menu. */
type ApiDish = {
  menu_item_id: number;
  title: string;
  /** The chip this dish sits under, already in the reader's language. */
  section: string;
  description: string | null;
  price_tiyin: number;
  was_tiyin: number | null;
  image_url: string | null;
  /** The size set — `ImageSet::toArray()` — beside the one address. */
  image?: ImagePayload | null;
  kind: string;
  sold_out: boolean;
};

/** `GET /api/v1/mp/orders` — the customer's own history. */
type ApiOrder = {
  number: string;
  state: string;
  rung: string | null;
  store: { slug: string | null; name: string | null; initials: string | null; tint: string | null };
  lines: readonly {
    menu_item_id: number;
    name: Trilingual;
    unit_price_tiyin: number;
    quantity: number;
    line_total_tiyin: number;
    note: string | null;
  }[];
  subtotal_tiyin: number;
  discount_tiyin: number;
  service_fee_tiyin: number;
  delivery_fee_tiyin: number;
  total_tiyin: number;
  pay_rail: string;
  address: string;
  eta_at: string | null;
  eta_minutes: number | null;
  courier: {
    name: string;
    rating: number;
    deliveries: number;
    position: { lat: number; lng: number; at: string } | null;
  } | null;
  can_cancel: boolean;
  can_rate: boolean;
  rating: number | null;
  stamps: Record<string, string | null>;
};

/**
 * The design's five rungs, keyed by the one the server names.
 *
 * The API tracks nine states and answers which of the five it lights, so this
 * is a lookup rather than a translation — but it is still written out, because
 * `null` (a cancelled order) has to become "no ladder at all" rather than
 * silently falling through to the first step.
 */
const RUNGS: Readonly<Record<string, MpStep>> = {
  placed: 'placed',
  accepted: 'accepted',
  cooking: 'cooking',
  courier: 'courier',
  delivered: 'delivered',
};

/**
 * A card, in the shape the boards already draw.
 *
 * `distanceKm` is the one field with no column behind it: the API answers
 * metres from wherever the asker said they were, and `null` when they said
 * nothing. Zero rather than a made-up figure — a marketplace that invents
 * distances sends people to the wrong side of the city, and the card renders
 * "0.0 km" rather than a lie with a decimal point.
 */
export function storeFrom(row: ApiStore): Store {
  return {
    id: row.slug,
    name: row.name,
    kind: row.kind ?? { uz: '', ru: '', en: '' },
    cuisine: row.cuisine,
    rating: row.rating,
    reviews: row.reviews_count,
    deliveryFee: row.delivery_fee_tiyin,
    distanceKm: row.distance_metres === null ? 0 : Math.round(row.distance_metres / 100) / 10,
    minutesFrom: row.minutes_from,
    minutesTo: row.minutes_to,
    ...(row.offer === null ? {} : { offer: row.offer }),
    ...(row.offer_tone === null ? {} : { offerTone: row.offer_tone as Store['offerTone'] }),
    open: row.is_open,
    initials: row.initials ?? row.name.slice(0, 2).toUpperCase(),
    tint: row.tint ?? '#2E74EA',
  };
}

/**
 * A dish, in the shape the store board draws.
 *
 * The title arrives already resolved to the reader's language — the API reads
 * `Accept-Language` and the catalogue's jsonb column — so the same string goes
 * into all three slots rather than the server inventing translations it does
 * not have. The alternative was three round trips for one menu.
 */
export function dishFrom(row: ApiDish): MpDish {
  const words = (text: string): Trilingual => ({ uz: text, ru: text, en: text });

  return {
    id: String(row.menu_item_id),
    name: words(row.title),
    /*
     * The section the endpoint names, not the dish's own title.
     *
     * This read the title, which gave every dish its own chip and made the
     * store screen's category filter show exactly one row. The catalogue has
     * always had sections; the endpoint now sends them.
     */
    category: words(row.section === '' ? row.title : row.section),
    price: row.price_tiyin,
    ...(row.was_tiyin === null ? {} : { was: row.was_tiyin }),
    ...(row.sold_out ? { soldOut: true } : {}),
    /*
     * Null — not absent — on a live dish without a photograph. Absence is
     * what marks a fixture dish in `STORE_MENU`; a live menu nobody has
     * photographed yet is a different fact and the board draws both the same.
     */
    image: dishImageFrom(row.image, row.image_url),
  };
}

/**
 * One row of the customer's order history.
 *
 * The four states the list draws are not the nine the server tracks, and the
 * mapping is the point of this function: `live` is anything still moving,
 * `past` is a delivered order already rated, `delivered` is one that is not —
 * because that is the row the screen grows a star strip on.
 */
export function historyFrom(row: ApiOrder): MpOrder {
  const state: MpOrder['state'] =
    row.state === 'cancelled' || row.state === 'rejected'
      ? 'cancelled'
      : row.state !== 'delivered'
        ? 'live'
        : row.can_rate
          ? 'delivered'
          : 'past';

  return {
    id: row.number,
    store: row.store.name ?? '—',
    total: row.total_tiyin,
    state,
    canRate: row.can_rate,
  };
}

/** The tracking screen's shape, from a live order. */
export type LiveTracking = {
  number: string;
  storeName: string;
  storeInitials: string;
  storeTint: string;
  /** Index into `MP_LADDER`, or -1 when the journey stopped. */
  reached: number;
  stamps: readonly string[];
  eta: string | null;
  minutesLeft: number | null;
  courier: { name: string; rating: number; deliveries: number } | null;
  total: number;
  paidWith: string;
  canCancel: boolean;
  live: true;
};

/**
 * One order, as the five-step rail reads it.
 *
 * The stamps come back as ISO instants and are formatted here rather than in
 * the client: a browser in another timezone would print a courier arriving
 * before the order was placed, and the restaurant's own hours are the ones a
 * guest is reasoning about.
 */
export function trackingFrom(row: ApiOrder, lang: Lang): LiveTracking {
  const ladder: readonly MpStep[] = ['placed', 'accepted', 'cooking', 'courier', 'delivered'];
  const rung = row.rung === null ? null : (RUNGS[row.rung] ?? null);

  const at = (value: string | null): string => {
    if (value === null) return '—';

    const parsed = Date.parse(value);

    return Number.isNaN(parsed)
      ? '—'
      : new Intl.DateTimeFormat(lang === 'uz' ? 'uz-UZ' : lang === 'ru' ? 'ru-RU' : 'en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(parsed);
  };

  return {
    number: row.number,
    storeName: row.store.name ?? '—',
    storeInitials: row.store.initials ?? '··',
    storeTint: row.store.tint ?? '#2E74EA',
    reached: rung === null ? -1 : ladder.indexOf(rung),
    stamps: ladder.map((step) => at(row.stamps[step] ?? null)),
    eta: row.eta_at === null ? null : at(row.eta_at),
    minutesLeft: row.eta_minutes,
    courier:
      row.courier === null
        ? null
        : {
            name: row.courier.name,
            rating: row.courier.rating,
            deliveries: row.courier.deliveries,
          },
    total: row.total_tiyin,
    paidWith: row.pay_rail,
    canCancel: row.can_cancel,
    live: true,
  };
}

/**
 * A marketplace read.
 *
 * `bearer` says whether the customer's own token goes with it. The directory
 * needs none — it is a shop window — and everything about a person needs one;
 * asking without it is a guaranteed 401, so a missing cookie answers `null`
 * before the request is made.
 */
async function read<T>(path: string, bearer: boolean): Promise<T | null> {
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (bearer) {
    const token = (await cookies()).get(MP_SESSION_COOKIE)?.value;

    if (token === undefined) return null;

    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${apiBase()}${path}`, {
      headers,
      // Never cached. A directory is allowed to be a minute stale; an order
      // somebody is watching a courier on is not, and one reader must never be
      // served another's page.
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return null;

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * The directory, and whether it is the real one.
 *
 * An empty live list is a real answer — a marketplace nobody has joined yet —
 * and it is NOT replaced by the fixture. It used to be, and the consequence was
 * the worst kind: a guest browsing a live platform saw storefronts that are not
 * on it, tapped one, and landed on a shop for a restaurant that does not exist.
 * The fixture is for one case only, the one the `live` flag names: the API did
 * not answer at all, and a marketplace that 500s while one restaurant's API
 * restarts would otherwise take every shop off the internet.
 */
export async function getStores(query?: {
  vertical?: string;
  cuisine?: string;
  q?: string;
  near?: string;
}): Promise<{ stores: readonly Store[]; live: boolean }> {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') search.set(key, value);
  }

  const suffix = search.size === 0 ? '' : `?${search.toString()}`;
  const answer = await read<{ data: ApiStore[] }>(`/mp/stores${suffix}`, false);

  if (!answer?.data) return { stores: STORES, live: false };

  return { stores: answer.data.map(storeFrom), live: true };
}

/** One shop window and its market menu. `null` store means "not on the market". */
export async function getStore(
  slug: string,
): Promise<{ store: Store | null; menu: readonly MpDish[]; live: boolean }> {
  const answer = await read<{ data: { store: ApiStore; menu: ApiDish[] } }>(
    `/mp/stores/${encodeURIComponent(slug)}`,
    false,
  );

  if (!answer?.data) return { store: null, menu: STORE_MENU, live: false };

  return {
    store: storeFrom(answer.data.store),
    // A live storefront with an empty window is a real state — a restaurant
    // that has joined and listed nothing yet — so it is NOT replaced by the
    // fixture here. Showing sample dishes somebody cannot buy is worse than
    // showing an empty shop.
    menu: answer.data.menu.map(dishFrom),
    live: true,
  };
}

/** The customer's own orders, newest first. */
export async function getMyOrders(): Promise<{ orders: readonly MpOrder[]; live: boolean }> {
  const answer = await read<{ data: ApiOrder[] }>('/mp/orders', true);

  if (!answer?.data) return { orders: MP_ORDERS, live: false };

  return { orders: answer.data.map(historyFrom), live: true };
}

/**
 * One order for the tracking screen.
 *
 * `null` when there is no session, no such order, or the API is unreachable —
 * all three mean the screen draws the fixture and says on itself that nothing
 * is being tracked. `MP_ORDER` is that fixture and it is deliberately not
 * returned from here: a sample dressed up as a live answer is the one failure
 * this whole module's `null` contract exists to prevent.
 */
export async function getTracking(number: string, lang: Lang): Promise<LiveTracking | null> {
  const answer = await read<{ data: ApiOrder }>(`/mp/orders/${encodeURIComponent(number)}`, true);

  return answer?.data === undefined ? null : trackingFrom(answer.data, lang);
}

/**
 * The newest live order, for a tracking screen reached with no number.
 *
 * The design's `/mp/track` has no parameter — it is the dock's third tab, and
 * what a person means by it is "the one I am waiting for". Newest first is what
 * the endpoint already answers, so the first still-moving row is that order.
 */
export async function getLatestTracking(lang: Lang): Promise<LiveTracking | null> {
  const answer = await read<{ data: ApiOrder[] }>('/mp/orders', true);

  const live = answer?.data?.find((row) => row.rung !== null && row.state !== 'delivered');

  return live === undefined ? null : trackingFrom(live, lang);
}

/** What the fixture tracking screen says when nothing is live. */
export const DEMO_TRACKING = MP_ORDER;

/* ======================================================== the account itself */

/** `GET /api/v1/mp/me` — the profile behind the cookie. */
type ApiConsumer = {
  name: string | null;
  phone: string;
  locale: string;
  points: number;
  plus: boolean;
  plus_until: string | null;
  notification_prefs: Record<string, boolean>;
};

/**
 * The four switches the notifications sheet draws.
 *
 * Written out rather than passed through, because the sheet renders exactly
 * these four and in this order: a fifth key arriving from the API must not
 * silently appear as an unlabelled switch, and a missing one must not render as
 * an empty row. The API sends all four with their defaults filled in — the
 * resource says so — so the fallbacks below are for the offline render rather
 * than for a partial answer.
 */
export type NotificationPrefs = {
  orders: boolean;
  promos: boolean;
  delivery: boolean;
  newsletter: boolean;
};

export type MpConsumer = {
  name: string;
  phone: string;
  points: number;
  plus: boolean;
  /** ISO instant, or `null` when there is no subscription running. */
  plusUntil: string | null;
  prefs: NotificationPrefs;
  live: true;
};

/**
 * Order updates default ON and marketing defaults OFF.
 *
 * Only reached when the API could not answer, and the asymmetry is the point:
 * a guest who never sees "your courier is downstairs" has a cold dinner, and a
 * guest who is opted into a newsletter by a fallback was never asked.
 */
export const PREF_DEFAULT: NotificationPrefs = {
  orders: true,
  promos: false,
  delivery: true,
  newsletter: false,
};

export function consumerFrom(row: ApiConsumer): MpConsumer {
  const prefs = row.notification_prefs ?? {};

  return {
    name: row.name ?? '—',
    phone: row.phone,
    points: row.points,
    plus: row.plus,
    plusUntil: row.plus_until,
    prefs: {
      orders: prefs.orders ?? PREF_DEFAULT.orders,
      promos: prefs.promos ?? PREF_DEFAULT.promos,
      delivery: prefs.delivery ?? PREF_DEFAULT.delivery,
      newsletter: prefs.newsletter ?? PREF_DEFAULT.newsletter,
    },
    live: true,
  };
}

/**
 * Who is signed in, or `null`.
 *
 * `null` covers all three of no cookie, a refused token and an API mid-restart,
 * and the profile screen draws the design's sample account with `live: false`
 * beside it — the same contract every read in this module keeps. A sample
 * profile is harmless in a way a sample order is not: nobody cooks anything.
 */
export async function getConsumer(): Promise<MpConsumer | null> {
  const answer = await read<{ data: ApiConsumer }>('/mp/me', true);

  return answer?.data === undefined ? null : consumerFrom(answer.data);
}
