import {
  MP_LADDER,
  MP_ORDER,
  MP_ORDERS,
  MP_POINTS,
  PAY_RAIL_MARKS,
  PLUS_MONTHLY,
  MARKETPLACE_SERVICE_PERCENT,
  SAVED_ADDRESSES,
  STORES,
  STORE_MENU,
  say,
  type MpDish,
  type MpOrder,
  type MpOrderState,
  type MpStep,
  type PayRail,
  type Store,
  type Trilingual,
} from '@restaurant/surfaces/mp/data';
import {
  deliverableFrom,
  type DeliveryZone,
  type GeoPoint,
  type Reach,
} from '@restaurant/surfaces/mp/geo';
import { dishImageFrom, type DishImage, type ImagePayload } from '@restaurant/surfaces/media/image';
import { writtenClock } from '@restaurant/surfaces/time/written';

import { Failure, get, patch, post } from '@/lib/api';
import { registerForPush } from '@/lib/push';
import { useLive, type Live } from '@/lib/live';
import { erase, KEYS, read, write } from '@/lib/storage';
import type { Lang } from '@/lib/locale';

/**
 * MyPOS's data layer — the consumer half of `Modules/Marketplace`.
 *
 * Same division of labour as `crew/live.ts`: the fetching is plumbing, and the
 * mapping underneath it is the part worth pinning. A wrong join on the staff app
 * shows a waiter another section's totals; a wrong map here quotes a guest a
 * price the kitchen never set, or draws a courier onto an order nobody has
 * accepted. So every `…From()` below is pure, takes its clock as a parameter,
 * and knows nothing about tokens.
 *
 * ---------------------------------------------------------------------------
 * Two scopes, and neither of them sends `X-Tenant`
 *
 * The shop window (`/mp/stores`) is anonymous and cross-tenant on purpose:
 * somebody comparing four restaurants is a customer of none of them, and the
 * routes carry no `tenant` group at all. Everything with a basket or a name on
 * it rides on `KEYS.mpSession` — a `marketplace.consumers` token, which is not
 * the same credential as `KEYS.session` and cannot stand in for it.
 *
 * Sending a tenant header here would be worse than useless: `ResolveTenant`
 * would pin the request to one restaurant and the directory would answer with
 * that restaurant's stores, which is the one thing a marketplace must not do.
 *
 * ---------------------------------------------------------------------------
 * Fixtures, and saying so
 *
 * Every read falls back to `@restaurant/surfaces/mp/data` and reports
 * `live: false` with the reason. That package is the shape both builds draw, so
 * the fallback is not a second design — it is the same screen with the same
 * rows and a line at the top admitting it is a sample. A store card a guest
 * taps and orders from believing it is real is the failure this prevents.
 */

/* ============================================================
   What the endpoints answer
   ============================================================ */

/** A jsonb `{uz,ru,en}` column, as it arrives — a language may simply be absent. */
type Locales = Partial<Record<Lang, string>>;

export type ApiStoreCard = {
  slug: string;
  name: string;
  kind: Locales | null;
  cuisine: string;
  vertical: string;
  rating: number;
  reviews_count: number;
  delivery_fee_tiyin: number;
  min_order_tiyin: number;
  minutes_from: number;
  minutes_to: number;
  offer: Locales | null;
  offer_tone: string | null;
  is_open: boolean;
  initials: string;
  tint: string;
  logo_url: string | null;
  cover_url: string | null;
  /** Null unless the request said where it was asking from. */
  distance_metres: number | null;
};

export type ApiMenuRow = {
  menu_item_id: number;
  /** One string, already in the reader's language — see `dishFrom()`. */
  title: string;
  /**
   * The menu section this dish sits in — "Asosiy", "Kabob", "Salat" — resolved
   * to the reader's language like `title`. Empty when the catalogue files the
   * dish under nothing.
   */
  section: string;
  description: string | null;
  price_tiyin: number;
  was_tiyin: number | null;
  image_url: string | null;
  /**
   * The photograph at its three sizes, with its inline placeholder —
   * `ImageSet::toArray()`. Absent from an older server; null where the dish
   * has none.
   */
  image?: ImagePayload | null;
  /** `food` · `drink` · `combo` · `other` — `MenuItem::KINDS`. */
  kind: string;
  sold_out: boolean;
};

export type ApiOrderLine = {
  menu_item_id: number;
  name: Locales;
  unit_price_tiyin: number;
  quantity: number;
  line_total_tiyin: number;
  note: string | null;
};

export type ApiOrder = {
  number: string;
  state: string;
  rung: MpStep | null;
  store: { slug: string | null; name: string | null; initials: string | null; tint: string | null };
  lines?: readonly ApiOrderLine[];
  subtotal_tiyin: number;
  discount_tiyin: number;
  service_fee_tiyin: number;
  service_percent: number;
  delivery_fee_tiyin: number;
  total_tiyin: number;
  promo_code: string | null;
  pay_rail: string;
  paid_at: string | null;
  address: string;
  address_note: string | null;
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
  stamps: Partial<Record<MpStep | 'cancelled', string | null>>;
  cancel_reason: string | null;
  reject_reason: string | null;
  created_at: string | null;
};

export type ApiAddress = {
  id: number;
  label: string;
  address: string;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
};

/**
 * Which kinds of message a guest wants, as the account stores them.
 *
 * Four keys and every one of them optional, because the column is nullable and
 * the migration says a missing key is a sensible default. The client fills the
 * gaps rather than rendering a switch that is neither on nor off — see
 * `notifyFrom()` for which way it fills them and why the server stays the
 * authority.
 */
export type ApiNotify = Partial<Record<NotifyKey, boolean>>;

export type ApiProfile = {
  name: string | null;
  phone: string;
  locale: string;
  points: number;
  plus: boolean;
  plus_until: string | null;
  addresses?: readonly ApiAddress[];
  notification_prefs?: ApiNotify | null;
};

/** The standing order behind a Plus subscription, when there is one. */
export type ApiSubscription = {
  state: string;
  plan: string;
  started_at: string | null;
  renews_at: string | null;
};

export type ApiPlus = {
  active: boolean;
  until: string | null;
  monthly_tiyin: number;
  free_delivery: boolean;
  free_delivery_minimum_tiyin: number;
  service_percent: number;
  subscription?: ApiSubscription | null;
};

/** One delivery circle, in the units the API talks in. */
export type ApiZone = {
  label: string;
  radius_km: number;
  latitude: number;
  longitude: number;
  fee_tiyin: number;
  min_order_tiyin: number;
};

export type ApiDelivery = {
  zones: readonly ApiZone[];
  max_radius_km: number | null;
};

/* ============================================================
   What the screens draw
   ============================================================ */

/**
 * A store card, which is the design's `Store` and two facts it had no room for.
 *
 * `Store` is the shape both builds already render, so it is kept whole rather
 * than replaced — the alternative is every card, chip and basket header learning
 * a second type for the same object. What is bolted on is what the fixture could
 * not know: the minimum basket this kitchen will cook, and whether the distance
 * printed under the name is a measurement or a placeholder.
 */
export type LiveStore = Store & {
  /** Tiyin. Zero means the kitchen sets no floor. */
  minOrder: number;
  /**
   * Metres from where the guest asked, or null when they never said.
   *
   * `Store.distanceKm` cannot express "unknown" — it is a number, and zero
   * reads as *next door*. A card checks this before it prints a distance.
   */
  distanceMetres: number | null;
  /** Which of the fifteen verticals it trades in. */
  vertical: string;
  /**
   * The circles this kitchen delivers inside.
   *
   * Empty on a *card*, and that is the endpoint's shape rather than an
   * omission: `GET /mp/stores` answers a directory and a directory of eight
   * shops carrying eight zone lists is a page nobody reads. The detail call
   * fills them, so the answer arrives at the moment the guest has chosen a
   * shop — which is also the first moment the question means anything.
   */
  zones: readonly DeliveryZone[];
  /** How far the furthest circle reaches, when the server says. */
  maxRadiusKm: number | null;
};

export type LiveDish = MpDish & {
  /**
   * What `POST /mp/orders` names this row.
   *
   * Null on a fixture dish, and that is the point: a basket built out of the
   * sample menu cannot be sent, because there is no id on the other end for the
   * kitchen to cook.
   */
  menuItemId: number | null;
  description: string | null;
  /**
   * The photograph, sized for whichever box draws it — `media/image.ts`. The
   * platform's own set when it holds one, the address a restaurant typed in
   * otherwise, null when there is neither.
   */
  image: DishImage | null;
};

export type Storefront = { store: LiveStore; menu: readonly LiveDish[] };

/** Re-exported so a screen draws a zone without reaching past this module. */
export type { DeliveryZone, GeoPoint };

/** The four switches on the notifications sheet. */
export type NotifyKey = 'orders' | 'promos' | 'delivery' | 'newsletter';

export type NotifyPrefs = Record<NotifyKey, boolean>;

export const NOTIFY_KEYS: readonly NotifyKey[] = ['orders', 'delivery', 'promos', 'newsletter'];

export type LiveOrder = MpOrder & {
  /** The printed number. Every order endpoint is keyed by it, not by an id. */
  number: string;
  rung: MpStep | null;
  canCancel: boolean;
  rating: number | null;
  /**
   * What was in it, as one line — "2 × Toshkent oshi, 1 × Achchiq lag'mon".
   *
   * `Ilova.dc.html:368` draws it under the shop's name in every history row,
   * and the row carried shop, number, state and total only. The endpoint has
   * always sent the lines — `ordersOf()` eager-loads them — so the whole of the
   * gap was here: a guest reading their own history could not tell two orders
   * from the same shop apart.
   *
   * Empty when the payload carried no lines, and the row then draws nothing
   * rather than an empty bullet.
   */
  contents: string;
  /**
   * How long a live order still has, in minutes — or null.
   *
   * The design's history row is the state AND the minutes: "Kuryer yo'lda · 9
   * daqiqa". The row said the state alone, so the one thing a person opens this
   * screen to find out was the one thing missing from it.
   *
   * Read off `eta_at` rather than `eta_minutes`, for the reason `trackFrom()`
   * gives: the second is the window promised when the order was placed and it
   * does not tick, so a list showing "9 minutes" half an hour later is worse
   * than one showing nothing.
   */
  minutesLeft: number | null;
};

export type TrackLine = { id: string; name: string; quantity: number; lineTotal: number };

export type Track = {
  number: string | null;
  /** How many rungs of `MP_LADDER` are behind it; the current one sits at this index. */
  reached: number;
  /** One stamp per rung, an em dash where nothing has happened yet. */
  stamps: readonly string[];
  /** The clock time it is due — `19:38` — or null when nothing has been promised. */
  eta: string | null;
  minutesLeft: number | null;
  courier: { name: string; rating: number; deliveries: number } | null;
  lines: readonly TrackLine[];
  /** Tiyin. */
  total: number;
  /** The wallet's own mark, `CLICK`, or the rail's key when it wears none. */
  paidWith: string;
  store: string;
  cancelled: boolean;
  canCancel: boolean;
};

export type MpAddress = {
  /** The address book row's id as a string, so a picker can key on it. */
  key: string;
  label: string;
  address: string;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
};

/**
 * Whether a courier will come here, and if not, which kind of "not".
 *
 * Three answers rather than two, and the third is the one that matters. An
 * address the storefront's circles do not cover is a refusal a guest can act on
 * — order for collection, or pick another address. An address with no
 * coordinates on it is **nobody knowing**, and greying it out on that basis
 * loses an order that would have been fine: the guest saved it before the map
 * existed, and the courier has been to it a dozen times.
 *
 * `unmapped` is therefore drawn as a caveat beside a row that still works,
 * never as a closed door. `@restaurant/surfaces/mp/geo` makes the same
 * distinction, and so does the server at checkout.
 */
export type AddressReach =
  | { state: 'ok'; zone: DeliveryZone; distanceKm: number }
  | { state: 'outside'; distanceKm: number | null }
  | { state: 'unmapped' }
  /** No storefront chosen yet, so there is no boundary to measure against. */
  | { state: 'unasked' };

/** An address as a point, or null when it was saved without one. */
export const pointOf = (address: MpAddress): GeoPoint | null =>
  address.latitude === null || address.longitude === null
    ? null
    : { latitude: address.latitude, longitude: address.longitude };

/**
 * The sheet's answer for one row, from real coordinates and the shop's own
 * circles.
 *
 * The arithmetic is `@restaurant/surfaces/mp/geo` — shared with the web
 * checkout precisely so a phone cannot say yes to an address the browser then
 * refuses. What is added here is the fourth state: a guest who has not opened a
 * shop yet has no boundary to be inside or outside of, and the honest thing to
 * draw for them is a row with nothing said about it.
 */
export function reachOf(zones: readonly DeliveryZone[], address: MpAddress): AddressReach {
  if (zones.length === 0) return { state: 'unasked' };

  const point = pointOf(address);

  if (point === null) return { state: 'unmapped' };

  const reach: Reach = deliverableFrom(zones, point);

  if (reach.deliverable) return { state: 'ok', zone: reach.zone, distanceKm: reach.distanceKm };

  // `unknown` cannot arrive here: the two cases that produce it — no zones and
  // no point — are both answered above. Kept as a branch rather than a cast so
  // a change to the shared helper shows up as a type error and not a mystery.
  return reach.reason === 'outside'
    ? { state: 'outside', distanceKm: reach.distanceKm }
    : { state: 'unmapped' };
}

export type MpProfile = {
  name: string | null;
  phone: string;
  locale: Lang;
  points: number;
  plus: boolean;
  plusUntil: string | null;
  addresses: readonly MpAddress[];
  notify: NotifyPrefs;
};

export type MpPlus = {
  active: boolean;
  until: string | null;
  /** Tiyin a month. */
  monthly: number;
  freeDelivery: boolean;
  /** Tiyin. Zero means free delivery at any basket size. */
  freeDeliveryMinimum: number;
  servicePercent: number;
  /**
   * `active` · `cancelled` · `lapsed`, or null when nobody has ever started one.
   *
   * Told apart from `active` above, which is only "is it working today": a
   * subscription cancelled this morning is `cancelled` and still `active` until
   * the month it was paid for runs out, and the sheet has to offer *stop* for
   * one and *start* for the other.
   */
  state: string | null;
  plan: string | null;
  /** When the next month would be charged. Null when nothing will be. */
  renewsAt: string | null;
};

/* ============================================================
   Mapping — pure, clock-injected, and tested by reading it
   ============================================================ */

/** A locale map with its gaps filled: a missing language reads as another, never blank. */
function trilingual(value: Locales | null | undefined, fallback = ''): Trilingual {
  const uz = value?.uz ?? value?.ru ?? value?.en ?? fallback;

  return { uz, ru: value?.ru ?? uz, en: value?.en ?? uz };
}

/**
 * A single string in three slots.
 *
 * The storefront endpoint resolves `title` against `X-Locale` and answers one
 * sentence, while the design's `MpDish` carries all three. Rather than invent
 * translations, the one the server chose is repeated — and the hook keys on the
 * language, so switching it refetches and the right sentence arrives.
 */
const echoed = (value: string): Trilingual => ({ uz: value, ru: value, en: value });

/** Three tones and nothing else; an unrecognised one is drawn as the neutral brand badge. */
function toneOf(value: string | null): 'brand' | 'warning' | 'danger' | undefined {
  if (value === null) return undefined;

  return value === 'warning' || value === 'danger' ? value : 'brand';
}

/**
 * What the menu rail falls back to when a dish belongs to no section.
 *
 * The chips are the kitchen's own sections now — `section` on every row, which
 * is what the design draws and what a cook thinks in. A dish the catalogue files
 * under nothing still has to go somewhere, and `MenuItem::KINDS` is the coarsest
 * grouping the platform has: four honest headings rather than one chip labelled
 * with the dish's own name, which is a filter that shows one row.
 *
 * Here rather than in `@restaurant/surfaces/mp/copy` because that catalogue has
 * no key for them — the design's store screen has sections and never needed a
 * word for "everything else".
 */
const KIND_WORD: Readonly<Record<string, Trilingual>> = {
  food: { uz: 'Taomlar', ru: 'Блюда', en: 'Food' },
  drink: { uz: 'Ichimliklar', ru: 'Напитки', en: 'Drinks' },
  combo: { uz: 'Setlar', ru: 'Наборы', en: 'Sets' },
  other: { uz: 'Boshqa', ru: 'Прочее', en: 'Other' },
};

/**
 * `2026-08-22T19:34:05+05:00` → `19:34`, on the clock the venue wrote.
 *
 * This used to read the stamp with `getHours()` and argued that the guest's own
 * zone was the right one, because the courier is coming to where the guest is
 * standing. It is the wrong reading, and the argument answers a question nobody
 * asked: a courier delivers inside a radius, so the kitchen and the doorstep are
 * in the same city and the same hour. What `getHours()` actually varies with is
 * not where the guest is but what their handset's clock is set to — so a phone
 * left on UTC after a flight draws a ladder five hours before the order was
 * placed, and a courier due at 00:20 is shown as 19:20 the previous evening,
 * which is worse than a wrong time. `@restaurant/surfaces/customer/order.ts`
 * reads the same stamps as written, and one guest holding one phone must not be
 * promised two different times by two of this platform's screens.
 *
 * The minutes beside these labels stay instants — `Date.parse` in
 * `minutesLeftOf` and `trackFrom` — and must: a gap between two instants carries
 * no zone, so nine minutes is nine minutes wherever the phone thinks it is.
 *
 * Null when nothing is stamped, which the ladder draws as an em dash rather than
 * as a guess.
 */
export function clock(iso: string | null | undefined): string | null {
  const written = writtenClock(iso, '');

  return written === '' ? null : written;
}

export function storeFrom(card: ApiStoreCard, delivery?: ApiDelivery | null): LiveStore {
  const offer = card.offer === null ? undefined : trilingual(card.offer);

  return {
    /*
     * The slug is the id, and that is what makes a shared link work: the route
     * is `/mp/store/{id}` in both builds and `GET /mp/stores/{slug}` is what
     * answers it. A numeric id here would need a second lookup somewhere.
     */
    id: card.slug,
    name: card.name,
    kind: trilingual(card.kind),
    cuisine: card.cuisine,
    vertical: card.vertical,
    rating: card.rating,
    reviews: card.reviews_count,
    deliveryFee: card.delivery_fee_tiyin,
    minOrder: card.min_order_tiyin,
    distanceMetres: card.distance_metres,
    // One decimal, which is what the design prints. Metres are the integer the
    // server keeps; a kilometre is a reading of it, not a stored quantity.
    distanceKm: card.distance_metres === null ? 0 : Math.round(card.distance_metres / 100) / 10,
    minutesFrom: card.minutes_from,
    minutesTo: card.minutes_to,
    ...(offer === undefined ? {} : { offer }),
    ...(toneOf(card.offer_tone) === undefined ? {} : { offerTone: toneOf(card.offer_tone) }),
    open: card.is_open,
    initials: card.initials,
    tint: card.tint,
    zones: (delivery?.zones ?? []).map(zoneFrom),
    maxRadiusKm: delivery?.max_radius_km ?? null,
  };
}

export function dishFrom(row: ApiMenuRow): LiveDish {
  return {
    id: String(row.menu_item_id),
    menuItemId: row.menu_item_id,
    name: echoed(row.title),
    description: row.description,
    category: row.section === '' ? (KIND_WORD[row.kind] ?? echoed(row.kind)) : echoed(row.section),
    price: row.price_tiyin,
    image: dishImageFrom(row.image, row.image_url),
    ...(row.was_tiyin === null ? {} : { was: row.was_tiyin }),
    ...(row.sold_out ? { soldOut: true } : {}),
  };
}

/**
 * One order, as the history list draws it.
 *
 * The four states the design's list carries are not the nine the ladder has, and
 * the reduction is deliberate: a guest scanning their history wants "on the way
 * · delivered · delivered · you cancelled it", not the difference between
 * `ready` and `courier_assigned`. Delivered splits on whether it can still be
 * rated, because that is the one row that grows a star strip.
 */
export function orderFrom(order: ApiOrder, now: number = Date.now()): LiveOrder {
  const state: MpOrderState =
    order.state === 'cancelled' || order.state === 'rejected'
      ? 'cancelled'
      : order.state === 'delivered'
        ? order.can_rate
          ? 'delivered'
          : 'past'
        : 'live';

  return {
    id: order.number,
    number: order.number,
    store: order.store.name ?? '',
    total: order.total_tiyin,
    state,
    canRate: order.can_rate,
    rung: order.rung,
    canCancel: order.can_cancel,
    rating: order.rating,
    contents: contentsOf(order.lines),
    minutesLeft: minutesLeftOf(order.eta_at, now),
  };
}

/** `eta_at` as whole minutes from now, floored at zero. Null when unset. */
function minutesLeftOf(etaAt: string | null, now: number): number | null {
  if (etaAt === null) return null;

  const dueAt = Date.parse(etaAt);

  return Number.isNaN(dueAt) ? null : Math.max(0, Math.round((dueAt - now) / 60_000));
}

/**
 * The line the design draws under a history row's shop name.
 *
 * `{{o.items}}` — "2 × Toshkent oshi, 1 × Achchiq lag'mon". Comma-separated in
 * the design and comma-separated here; the quantity leads because that is the
 * part a person scanning for "the big order" is looking for.
 *
 * Language is not a parameter: a history row is read in whatever the app is set
 * to, and the caller passes the resolved names. `say()` is applied at the call
 * site for the same reason every other name on this surface is.
 */
export function contentsOf(lines: readonly ApiOrderLine[] | undefined, lang: Lang = 'uz'): string {
  if (lines === undefined || lines.length === 0) return '';

  return lines
    .map((line) => `${line.quantity} × ${line.name[lang] ?? line.name.uz ?? ''}`.trim())
    .join(', ');
}

/**
 * One order, as the tracking screen draws it.
 *
 * `now` is a parameter rather than a call, so a test asserts a minute and not
 * "roughly" — the same rule `crew/live.ts` follows, and for a stronger reason:
 * the number on this screen is what a person plans the next twenty minutes
 * around.
 *
 * The remaining minutes are read off `eta_at` rather than trusted from
 * `eta_minutes`. The second is the window the kitchen promised when the order
 * was placed and it does not tick; a screen showing "9 minutes" for half an
 * hour is worse than one showing nothing.
 */
export function trackFrom(order: ApiOrder, now: number): Track {
  const cancelled = order.state === 'cancelled' || order.state === 'rejected';

  const reached =
    order.rung === null
      ? 0
      : order.rung === 'delivered'
        ? MP_LADDER.length
        : Math.max(0, MP_LADDER.indexOf(order.rung));

  const dueAt = order.eta_at === null ? null : Date.parse(order.eta_at);

  const minutesLeft =
    dueAt !== null && !Number.isNaN(dueAt)
      ? Math.max(0, Math.round((dueAt - now) / 60_000))
      : order.eta_minutes;

  const mark = PAY_RAIL_MARKS[order.pay_rail as PayRail];

  return {
    number: order.number,
    reached,
    stamps: MP_LADDER.map((rung) => clock(order.stamps[rung]) ?? '—'),
    eta: clock(order.eta_at),
    minutesLeft: cancelled ? null : minutesLeft,
    courier:
      order.courier === null
        ? null
        : {
            name: order.courier.name,
            rating: order.courier.rating,
            deliveries: order.courier.deliveries,
          },
    lines: (order.lines ?? []).map((line) => ({
      id: String(line.menu_item_id),
      name: trilingual(line.name).uz,
      quantity: line.quantity,
      lineTotal: line.line_total_tiyin,
    })),
    total: order.total_tiyin,
    paidWith: mark?.logo ?? order.pay_rail,
    store: order.store.name ?? '',
    cancelled,
    canCancel: order.can_cancel,
  };
}

const LANGS: readonly Lang[] = ['uz', 'ru', 'en'];

const asLang = (value: string): Lang =>
  (LANGS as readonly string[]).includes(value) ? (value as Lang) : 'uz';

export function addressFrom(address: ApiAddress): MpAddress {
  return {
    key: String(address.id),
    label: address.label,
    address: address.address,
    note: address.note,
    latitude: address.latitude,
    longitude: address.longitude,
    isDefault: address.is_default,
  };
}

/**
 * The four switches, with any the server has not stored yet filled in.
 *
 * Missing reads as **on**, for all four. The column is nullable and a guest who
 * has never opened this sheet has stored nothing, so every key is missing on
 * the first read — defaulting to off would draw four switches saying the app
 * will not tell them their order is on the way, which is both untrue and the
 * opposite of what the account does today. The server remains the authority:
 * this only decides what a *gap* looks like, and the first save writes all four
 * explicitly so there are no gaps left.
 */
export function notifyFrom(prefs: ApiNotify | null | undefined): NotifyPrefs {
  return {
    orders: prefs?.orders ?? true,
    promos: prefs?.promos ?? true,
    delivery: prefs?.delivery ?? true,
    newsletter: prefs?.newsletter ?? true,
  };
}

export function profileFrom(profile: ApiProfile): MpProfile {
  return {
    name: profile.name,
    phone: profile.phone,
    locale: asLang(profile.locale),
    points: profile.points,
    plus: profile.plus,
    plusUntil: profile.plus_until,
    addresses: (profile.addresses ?? []).map(addressFrom),
    notify: notifyFrom(profile.notification_prefs),
  };
}

export const plusFrom = (plus: ApiPlus): MpPlus => ({
  active: plus.active,
  until: plus.until,
  monthly: plus.monthly_tiyin,
  freeDelivery: plus.free_delivery,
  freeDeliveryMinimum: plus.free_delivery_minimum_tiyin,
  servicePercent: plus.service_percent,
  state: plus.subscription?.state ?? null,
  plan: plus.subscription?.plan ?? null,
  renewsAt: plus.subscription?.renews_at ?? null,
});

/**
 * One circle, in the units the screen measures with.
 *
 * Kilometres both sides — the API publishes `radius_km` and `haversineKm()`
 * answers in kilometres — so nothing here converts anything. The rename is
 * `snake_case` to `camelCase` and nothing more, which is the point: a unit
 * conversion hidden in a field mapping is how a five-kilometre zone becomes
 * five metres.
 */
export const zoneFrom = (zone: ApiZone): DeliveryZone => ({
  label: zone.label,
  radiusKm: zone.radius_km,
  latitude: zone.latitude,
  longitude: zone.longitude,
  feeTiyin: zone.fee_tiyin,
  minOrderTiyin: zone.min_order_tiyin,
});

/* ============================================================
   The fixtures, in the shapes above

   Mapped rather than re-typed, so a screen has one type to draw and the sample
   cannot quietly grow a field the live answer does not have.
   ============================================================ */

/** A fixture store, with the two live-only facts filled in as honestly as they can be. */
/**
 * The sample storefront's own circles, and the reason they are here at all.
 *
 * The design's address sheet draws a greyed-out third row, and that row only
 * exists because somewhere a boundary said no. Before this the "no" was a
 * boolean typed into the fixture, which meant the sheet's most important state
 * was the one piece of it no arithmetic had ever produced — it could not be
 * wrong, and so it could not be right either.
 *
 * Two circles rather than one, because that is the case the shared helper has a
 * rule for: an inner cheap ring and an outer dearer one, with the *nearest
 * covering* zone winning. `SAVED_ADDRESSES` says the home address costs 12 000
 * to reach and work costs 18 000, and with the coordinates below those two
 * numbers now come out of `deliverableFrom()` rather than out of a caption.
 *
 * Tiyin, like every other amount in this app: 12 000 so'm is 1 200 000.
 */
const DEMO_ZONES: readonly DeliveryZone[] = [
  {
    label: 'Markaz',
    radiusKm: 3,
    latitude: 41.3111,
    longitude: 69.2797,
    feeTiyin: 1_200_000,
    minOrderTiyin: 0,
  },
  {
    label: 'Shahar',
    radiusKm: 6,
    latitude: 41.3111,
    longitude: 69.2797,
    feeTiyin: 1_800_000,
    minOrderTiyin: 0,
  },
];

const asLiveStore = (store: Store): LiveStore => ({
  ...store,
  minOrder: 0,
  // The fixture *does* know its distance, so the card prints it. Only a live
  // card with no `near=` in the query has nothing to say.
  distanceMetres: Math.round(store.distanceKm * 1_000),
  vertical: 'food',
  zones: DEMO_ZONES,
  maxRadiusKm: 6,
});

export const DEMO_STORES: readonly LiveStore[] = STORES.map(asLiveStore);

const asLiveDish = (dish: MpDish): LiveDish => ({
  ...dish,
  // Null: a sample dish has no menu item behind it, so the cart refuses to send
  // a basket built from one rather than posting ids no kitchen recognises.
  menuItemId: null,
  description: null,
  // No photograph either: a sample dish draws the store's flat tint, as the
  // design's own slot does with nothing to show.
  image: null,
});

export const DEMO_MENU: readonly LiveDish[] = STORE_MENU.map(asLiveDish);

/**
 * The sample store a slug nothing recognises falls back to.
 *
 * `noUncheckedIndexedAccess` is on, so `STORES[0]` is possibly undefined and
 * TypeScript cannot know a fixture has rows. Unwrapped once, here, with a name —
 * a cast at the call site is how the next call site eventually forgets.
 */
const FALLBACK_STORE: LiveStore = asLiveStore(
  STORES[0] ?? {
    id: 'none',
    name: '—',
    kind: { uz: '', ru: '', en: '' },
    cuisine: '',
    rating: 0,
    reviews: 0,
    deliveryFee: 0,
    distanceKm: 0,
    minutesFrom: 0,
    minutesTo: 0,
    open: false,
    initials: '—',
    tint: '#4C5568',
  },
);

export const demoStorefront = (slug: string): Storefront => ({
  store: DEMO_STORES.find((store) => store.id === slug) ?? FALLBACK_STORE,
  menu: DEMO_MENU,
});

export const DEMO_ORDERS: readonly LiveOrder[] = MP_ORDERS.map((order: MpOrder) => ({
  ...order,
  number: order.id,
  rung: order.state === 'live' ? 'courier' : order.state === 'cancelled' ? null : 'delivered',
  canCancel: false,
  rating: null,
  /* The fixture list has no lines behind it, and the row draws nothing rather
     than inventing a basket for a demo order. */
  contents: '',
  minutesLeft: null,
}));

export function demoTrack(lang: Lang): Track {
  return {
    number: MP_ORDER.number,
    reached: MP_ORDER.reached,
    stamps: MP_ORDER.stamps,
    eta: MP_ORDER.eta,
    minutesLeft: MP_ORDER.minutesLeft,
    courier: {
      name: say(MP_ORDER.courier.name, lang),
      rating: MP_ORDER.courier.rating,
      deliveries: MP_ORDER.courier.deliveries,
    },
    lines: [],
    total: MP_ORDER.total,
    paidWith: say(MP_ORDER.paidWith, lang),
    store: STORES.find((store) => store.id === MP_ORDER.storeId)?.name ?? '',
    cancelled: false,
    canCancel: false,
  };
}

/**
 * Where the three sample addresses actually are.
 *
 * Real Tashkent coordinates, chosen so the distances the fixture's own captions
 * quote are the distances `haversineKm()` computes against `DEMO_ZONES`: 2.4 km
 * for Chilonzor, 5.1 km for Amir Temur, and Zangiota sixteen kilometres out and
 * therefore outside every circle. `SAVED_ADDRESSES.deliverable` is no longer
 * read — the sample answers the same question the live book does, through the
 * same helper, which is the only way the disabled row stays honest.
 */
const DEMO_POINTS: Readonly<Record<string, GeoPoint>> = {
  home: { latitude: 41.295, longitude: 69.26 },
  work: { latitude: 41.3555, longitude: 69.295 },
  parents: { latitude: 41.22, longitude: 69.13 },
};

export const demoAddresses = (lang: Lang): readonly MpAddress[] =>
  SAVED_ADDRESSES.map((entry) => ({
    key: entry.key,
    label: say(entry.label, lang),
    address: say(entry.address, lang),
    note: say(entry.note, lang),
    latitude: DEMO_POINTS[entry.key]?.latitude ?? null,
    longitude: DEMO_POINTS[entry.key]?.longitude ?? null,
    isDefault: entry.key === 'home',
  }));

export const demoProfile = (lang: Lang): MpProfile => ({
  name: null,
  phone: '',
  locale: lang,
  points: MP_POINTS.balance,
  plus: false,
  plusUntil: null,
  addresses: demoAddresses(lang),
  notify: notifyFrom(null),
});

export const DEMO_PLUS: MpPlus = {
  active: false,
  until: null,
  monthly: PLUS_MONTHLY,
  freeDelivery: true,
  freeDeliveryMinimum: 0,
  servicePercent: MARKETPLACE_SERVICE_PERCENT,
  state: null,
  plan: null,
  renewsAt: null,
};

/* ============================================================
   The line a screen prints when it is drawing the sample
   ============================================================ */

/** What a loader throws when this phone holds no consumer token. */
const NO_SESSION = 'no marketplace session';

/**
 * Said above the list, never after it.
 *
 * Same rule as the staff app's `demoFloor`: a guest who orders from a demo store
 * card is a guest who thinks they have ordered dinner. `MP.notWired` in
 * `@restaurant/surfaces/mp/copy` used to carry this job and now says something
 * untrue — "no module, no schema, no endpoints" — because there are all three.
 * That catalogue is the web build's as well, so correcting it belongs with the
 * web build's own wiring; until then no screen here prints it, and these are
 * what they print instead.
 */
const SAMPLE_NOTE: Trilingual = {
  uz: 'Namunaviy ma’lumot — server javob bermadi. Qayta urinish uchun bosing.',
  ru: 'Демо-данные — сервер не ответил. Нажмите, чтобы повторить.',
  en: 'Sample data — the server did not answer. Tap to try again.',
};

/**
 * The kitchen's floor, said on the store page rather than at checkout.
 *
 * `@restaurant/surfaces/mp/copy` has no key for it, and the reason is structural
 * rather than an oversight: the design's `Store` carries no minimum, so the
 * catalogue transcribed from it never needed the sentence. `StoreCard` publishes
 * `min_order_tiyin`, and `POST /mp/orders` refuses a basket under it with
 * `marketplace.below_minimum` — which the cart does print in the server's own
 * words. This is the same fact said early enough to act on: a guest who finds
 * out after choosing four dishes, an address and a card finds out too late.
 */
const MIN_ORDER_NOTE: Trilingual = {
  uz: 'Eng kam buyurtma {amount}',
  ru: 'Минимальный заказ {amount}',
  en: 'Minimum order {amount}',
};

export const minOrderNote = (amount: string, lang: Lang): string =>
  MIN_ORDER_NOTE[lang].replace('{amount}', amount);

/** The other reason a screen has nothing: nobody has signed in on this phone. */
const SIGN_IN_NOTE: Trilingual = {
  uz: 'Telefon raqami bilan kiring — buyurtmalar va profil shundan keyin ko‘rinadi.',
  ru: 'Войдите по номеру телефона — заказы и профиль появятся после этого.',
  en: 'Sign in with your phone number — your orders and profile appear after that.',
};

/**
 * The two sentences apart, because they ask for two different things.
 *
 * "The server did not answer" asks for a retry; "you are not signed in" asks for
 * a phone number, and offering a retry button for it would loop forever.
 */
export const sampleNote = (problem: string | null, lang: Lang): string =>
  problem === NO_SESSION
    ? say(SIGN_IN_NOTE, lang)
    : `${say(SAMPLE_NOTE, lang)}${problem === null ? '' : ` · ${problem}`}`;

/** True when the only thing missing is a session — the screen offers sign-in, not retry. */
export const needsSignIn = (problem: string | null): boolean => problem === NO_SESSION;

/* ============================================================
   Asking the server
   ============================================================ */

/**
 * The shop window asks anonymously, on purpose.
 *
 * `/mp/stores` ignores a bearer, and a token sent where it is not read is a
 * token in one more access log for no gain. The same call the web build makes
 * before anybody has signed in.
 */
const anonymous = (lang: Lang) => ({ bearer: null, locale: lang }) as const;

/** Everything with a basket or a name on it. No tenant — see the file docblock. */
const mine = (lang: Lang) => ({ bearer: KEYS.mpSession, locale: lang }) as const;

async function requireSession(): Promise<void> {
  if ((await read(KEYS.mpSession)) === null) throw new Error(NO_SESSION);
}

/**
 * A read behind the consumer token, with the one failure that has to be acted on
 * rather than reported.
 *
 * A 401 or a 403 against a token this phone is holding means the token is
 * finished — ninety days ran out, or the account was blocked. Kept, it turns
 * every screen into a retry button for a request that can never succeed. Erased,
 * the next load says "sign in", which is both true and something a person can
 * do. Anything else — no network, a restarting API — leaves the session alone:
 * it is almost certainly still good.
 *
 * The consumer surface publishes no revoke endpoint, so this is also the only
 * way a token ever leaves the Keychain. There is no sign-out control anywhere in
 * the marketplace design, on either build.
 */
async function authed<T>(load: () => Promise<T>): Promise<T> {
  await requireSession();

  try {
    return await load();
  } catch (error) {
    if (error instanceof Failure && (error.status === 401 || error.status === 403)) {
      await erase(KEYS.mpSession);

      throw new Error(NO_SESSION);
    }

    throw error;
  }
}

export const hasMarketplaceSession = async (): Promise<boolean> =>
  (await read(KEYS.mpSession)) !== null;

export type Directory = { vertical?: string | null; cuisine?: string | null; q?: string | null };

export async function storeDirectory(
  lang: Lang,
  filter: Directory = {},
): Promise<readonly LiveStore[]> {
  const query = new URLSearchParams();

  if (filter.vertical) query.set('vertical', filter.vertical);
  if (filter.cuisine) query.set('cuisine', filter.cuisine);
  if (filter.q) query.set('q', filter.q);

  /*
   * No `near=`. Asking for a coordinate means asking for location permission,
   * which needs `expo-location` — a dependency this build does not take — and
   * the directory answers without it. The cost is `distance_metres: null` and a
   * card that prints no distance, which is the honest version of not knowing.
   */
  const suffix = query.toString();
  const answer = await get<{ data: readonly ApiStoreCard[] }>(
    `/mp/stores${suffix === '' ? '' : `?${suffix}`}`,
    anonymous(lang),
  );

  // Wrapped rather than passed by reference: `map` hands its callback the index
  // as a second argument, and `storeFrom`'s second argument is the delivery
  // block — so the bare reference would post card zero's zones as `0`.
  return answer.data.map((card) => storeFrom(card));
}

export async function storefront(slug: string, lang: Lang): Promise<Storefront> {
  const answer = await get<{
    data: {
      store: ApiStoreCard;
      menu: readonly ApiMenuRow[];
      /**
       * Absent on a server that has not shipped the zones yet, which is a state
       * this client has to survive rather than crash on: an older API answers
       * the same two keys it always did, and a storefront with no boundary
       * declared is "everywhere" — the state every shop is in on its first day.
       */
      delivery?: ApiDelivery | null;
    };
  }>(`/mp/stores/${encodeURIComponent(slug)}`, anonymous(lang));

  return {
    store: storeFrom(answer.data.store, answer.data.delivery),
    menu: answer.data.menu.map(dishFrom),
  };
}

export async function myOrders(lang: Lang): Promise<readonly LiveOrder[]> {
  return authed(async () => {
    const answer = await get<{ data: readonly ApiOrder[] }>('/mp/orders', mine(lang));

    return answer.data.map(orderFrom);
  });
}

/**
 * The order the tracking screen is about.
 *
 * `number` is what this device remembers placing. When it remembers nothing —
 * a reinstall, a second phone, an app killed between the tap and the screen —
 * the newest order still on the ladder is the right answer, because that is the
 * one a person opening "track" is asking about.
 */
export async function orderTrack(
  lang: Lang,
  number: string | null,
  now: number = Date.now(),
): Promise<Track> {
  return authed(async () => {
    if (number !== null) {
      const answer = await get<{ data: ApiOrder }>(
        `/mp/orders/${encodeURIComponent(number)}`,
        mine(lang),
      );

      return trackFrom(answer.data, now);
    }

    const list = await get<{ data: readonly ApiOrder[] }>('/mp/orders', mine(lang));
    const live = list.data.find((order) => order.rung !== null && order.state !== 'delivered');
    const newest = live ?? list.data[0];

    if (newest === undefined) throw new Error('no orders');

    return trackFrom(newest, now);
  });
}

export async function myProfile(lang: Lang): Promise<MpProfile> {
  return authed(async () => {
    const answer = await get<{ data: ApiProfile }>('/mp/me', mine(lang));

    return profileFrom(answer.data);
  });
}

export async function myPlus(lang: Lang): Promise<MpPlus> {
  return authed(async () => {
    const answer = await get<{ data: ApiPlus }>('/mp/plus', mine(lang));

    return plusFrom(answer.data);
  });
}

/* ============================================================
   Hooks — one per screen
   ============================================================ */

export const useStoreDirectory = (lang: Lang, filter: Directory): Live<readonly LiveStore[]> =>
  useLive(
    () => storeDirectory(lang, filter),
    DEMO_STORES,
    `${lang}:${filter.vertical ?? ''}:${filter.cuisine ?? ''}:${filter.q ?? ''}`,
  );

export const useStorefront = (slug: string | undefined, lang: Lang): Live<Storefront> =>
  useLive(
    async () => {
      if (slug === undefined) throw new Error('no store');

      return storefront(slug, lang);
    },
    demoStorefront(slug ?? ''),
    `${lang}:${slug ?? ''}`,
  );

export const useMyOrders = (lang: Lang): Live<readonly LiveOrder[]> =>
  useLive(() => myOrders(lang), DEMO_ORDERS, lang);

export const useOrderTrack = (lang: Lang, number: string | null): Live<Track> =>
  useLive(() => orderTrack(lang, number), demoTrack(lang), `${lang}:${number ?? ''}`);

export const useMpProfile = (lang: Lang): Live<MpProfile> =>
  useLive(() => myProfile(lang), demoProfile(lang), lang);

export const useMpPlus = (lang: Lang): Live<MpPlus> => useLive(() => myPlus(lang), DEMO_PLUS, lang);

/* ============================================================
   The writes

   These answer rather than throw, for the reason `customer/account.ts` gives at
   length: "kod noto'g'ri", "the shop just closed" and "your basket is under the
   minimum" are three different things for a person to do next, and the error
   catalogue already tells them apart in three languages. A screen that caught
   one exception and printed one sentence would flatten all three.

   The envelope reader is repeated here rather than imported from that file
   because it is bound to the customer surface's tenant scope; this half of the
   app has no tenant at all.
   ============================================================ */

/**
 * The refusal a sheet answers rather than a sentence.
 *
 * `RequireConsumerToken` returns it for a missing token, a token belonging to
 * somebody who is not a consumer, and a token whose ability has been stripped.
 * All three mean the same thing to a person: sign in again.
 */
export const TOKEN_REQUIRED = 'marketplace.consumer_token_required';

export type Failed = { ok: false; code: string; message: string | null; retryAfter?: number };
export type Answer<T> = ({ ok: true } & T) | Failed;

/** What the API's error envelope carries, narrowed to what a screen reads. */
type Envelope = {
  code?: string;
  message_uz?: string;
  message_ru?: string;
  message_en?: string;
  retry_after?: number;
};

function failed(error: unknown, lang: Lang): Failed {
  if (!(error instanceof Failure)) {
    return { ok: false, code: 'unknown', message: null };
  }

  const body = (error.body ?? {}) as Envelope;

  return {
    ok: false,
    code: body.code ?? (error.status === 0 ? 'offline' : 'rejected'),
    message:
      (lang === 'ru' ? body.message_ru : lang === 'en' ? body.message_en : body.message_uz) ?? null,
    retryAfter: body.retry_after,
  };
}

export async function requestCode(
  phone: string,
  lang: Lang,
): Promise<Answer<{ data: { expires_in: number; retry_after: number; code_length: number } }>> {
  try {
    const sent = await post<{
      data: { expires_in: number; retry_after: number; code_length: number };
    }>('/mp/auth/otp', { phone, locale: lang }, anonymous(lang));

    return { ok: true, ...sent };
  } catch (error) {
    return failed(error, lang);
  }
}

/**
 * The code, for a consumer session.
 *
 * The token reaches the Keychain before this returns, so a sheet that closes on
 * success closes over a signed-in app rather than one that is about to be.
 */
export async function verifyCode(
  phone: string,
  code: string,
  lang: Lang,
  name?: string,
): Promise<Answer<{ data: MpProfile }>> {
  try {
    const session = await post<{ token: string; data: ApiProfile }>(
      '/mp/auth/otp/verify',
      { phone, code, locale: lang, name, device_name: 'mypos-app' },
      anonymous(lang),
    );

    await write(KEYS.mpSession, session.token);

    /*
     * Now that there is somebody to page, and only now.
     *
     * Deliberately not awaited into the result: the permission prompt is a
     * modal the OS puts up, and a sheet that waited for it would sit on
     * "signing in…" until the guest had answered a question about something
     * else. A refusal or a slow network costs nothing here — the next sign-in
     * tries again, and the token rotates anyway.
     */
    void registerConsumerPush(lang);

    return { ok: true, data: profileFrom(session.data) };
  } catch (error) {
    return failed(error, lang);
  }
}

/** The reader's language, written to the account so a receipt SMS arrives in it. */
export async function saveLocale(lang: Lang): Promise<Answer<{ data: MpProfile }>> {
  try {
    const saved = await patch<{ data: ApiProfile }>('/mp/me', { locale: lang }, mine(lang));

    return { ok: true, data: profileFrom(saved.data) };
  } catch (error) {
    return failed(error, lang);
  }
}

/**
 * Which messages this guest wants, written to the account.
 *
 * All four keys every time, never a patch of the one that moved. The column is
 * a single jsonb value and a partial write is a read-modify-write race with the
 * guest's other device — and the losing half of that race is somebody being
 * texted about a promotion they switched off this morning.
 */
export async function saveNotify(
  prefs: NotifyPrefs,
  lang: Lang,
): Promise<Answer<{ data: MpProfile }>> {
  try {
    const saved = await patch<{ data: ApiProfile }>(
      '/mp/me',
      { notification_prefs: prefs },
      mine(lang),
    );

    return { ok: true, data: profileFrom(saved.data) };
  } catch (error) {
    return failed(error, lang);
  }
}

/**
 * This phone, registered as somewhere the marketplace can reach this guest.
 *
 * Called after a sign-in rather than on launch, and best-effort like the staff
 * app's: a refused permission or a slow network must not stand between somebody
 * and their order history. `registerForPush` picks the consumer door — see the
 * endpoint map in `lib/push.ts` for why it is not the shared one.
 */
export const registerConsumerPush = (lang: Lang): Promise<boolean> =>
  registerForPush('mp', mine(lang));

/* ---------------------------------------------------------------- MyPOS Plus */

/**
 * Start the subscription.
 *
 * `invoice` comes back when the provider wants the first month paid before the
 * benefit starts, and null when the free first month means there is nothing to
 * charge yet. The screen has to handle both: a guest who is told to pay for a
 * month advertised as free would not press the button twice.
 */
export type PlusStarted = {
  active: boolean;
  until: string | null;
  plan: string | null;
  renews_at: string | null;
  monthly_tiyin: number;
  invoice: { token: string; url: string; provider: string } | null;
};

export async function startPlus(lang: Lang): Promise<Answer<{ data: PlusStarted }>> {
  try {
    const started = await post<{ data: PlusStarted }>('/mp/plus/subscribe', {}, mine(lang));

    return { ok: true, ...started };
  } catch (error) {
    return failed(error, lang);
  }
}

/**
 * Stop it, without stopping it today.
 *
 * The server answers with the date the month already paid for runs out, and the
 * sheet says so: a guest who cancels on the second of the month has twenty-nine
 * days of free delivery left and must not be told the benefit is gone.
 */
export async function stopPlus(
  lang: Lang,
): Promise<Answer<{ data: { active: boolean; until: string | null; state: string } }>> {
  try {
    const stopped = await post<{ data: { active: boolean; until: string | null; state: string } }>(
      '/mp/plus/cancel',
      {},
      mine(lang),
    );

    return { ok: true, ...stopped };
  } catch (error) {
    return failed(error, lang);
  }
}

export type PlacedLine = { menu_item_id: number; quantity: number; note?: string };

export type PlaceOrder = {
  store: string;
  lines: readonly PlacedLine[];
  address: string;
  address_note?: string;
  latitude?: number;
  longitude?: number;
  pay_rail?: PayRail;
  promo_code?: string;
  /** The basket's own reference — see `basket.ts`. Sent every time, minted once. */
  client_reference?: string;
};

/**
 * Sends the basket.
 *
 * `client_reference` is what makes a retry safe, and it has to be: the consumer
 * routes carry no `Idempotency-Key` middleware — that guard claims its key
 * against a tenant, and this surface has none — so the guarantee lives in a
 * unique `(consumer_id, client_reference)` index instead. The same reference
 * twice returns the same order rather than cooking a second dinner.
 */
export async function placeOrder(
  order: PlaceOrder,
  lang: Lang,
): Promise<Answer<{ data: LiveOrder }>> {
  try {
    const placed = await post<{ data: ApiOrder }>('/mp/orders', order, mine(lang));

    return { ok: true, data: orderFrom(placed.data) };
  } catch (error) {
    return failed(error, lang);
  }
}

export async function rateOrder(
  number: string,
  rating: number,
  lang: Lang,
  comment?: string,
): Promise<Answer<{ data: LiveOrder }>> {
  try {
    const rated = await post<{ data: ApiOrder }>(
      `/mp/orders/${encodeURIComponent(number)}/rate`,
      { rating, comment },
      mine(lang),
    );

    return { ok: true, data: orderFrom(rated.data) };
  } catch (error) {
    return failed(error, lang);
  }
}

/**
 * Calls the order off, while the restaurant still can.
 *
 * `can_cancel` is the server's answer and it is only true at `placed` and
 * `accepted`; past that the food exists and somebody has paid for the
 * ingredients. The screen offers the control on that flag alone rather than on
 * a clock of its own, because the two would disagree on a slow connection.
 */
export async function cancelOrder(
  number: string,
  lang: Lang,
  reason?: string,
): Promise<Answer<{ data: LiveOrder }>> {
  try {
    const cancelled = await post<{ data: ApiOrder }>(
      `/mp/orders/${encodeURIComponent(number)}/cancel`,
      { reason },
      mine(lang),
    );

    return { ok: true, data: orderFrom(cancelled.data) };
  } catch (error) {
    return failed(error, lang);
  }
}
