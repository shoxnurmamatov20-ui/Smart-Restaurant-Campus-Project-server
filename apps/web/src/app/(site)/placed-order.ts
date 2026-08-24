'use client';

import { useSyncExternalStore } from 'react';

import { VAT_PERCENT } from '@restaurant/surfaces/money';

import { say, som, type SiteLocale, type Trilingual } from './venue-data';

/**
 * The order a guest has just placed, on the phone they placed it from.
 *
 * The tracking screen used to open on `const hasOrder = false` — one literal,
 * never assigned anywhere else — so the five-rung ladder, the progress rail,
 * the map, the courier card, the line list and the total panel could not render
 * for anybody, ever. Eight `site.track.*` keys had been written in three
 * languages for markup no reader could reach.
 *
 * **What this is now that the order is real.** `POST /api/v1/public/orders`
 * takes the basket and answers with a bill: its number, its clock and the
 * totals the server computed. This module is the *receipt* of that — the two
 * credentials the tracking screen needs (`number`, and the last four digits of
 * the telephone that placed it) plus what was charged, written into this
 * browser so the screen can draw a bill the moment it opens rather than after a
 * round trip, and so it can still draw one on a train.
 *
 * Nothing here is authoritative any more, and that is the point of the split:
 * where the food actually is comes from `GET /api/v1/public/orders/{number}`
 * every few seconds (see `site-client.ts`), and this holds only what the guest
 * already saw and agreed to. A local record that disagreed with the server about
 * the rung would be a screen telling somebody their dinner is cooking after it
 * arrived; one that disagrees about the total cannot happen, because the total
 * written here is the one the server sent back.
 *
 * The design's own fixture is still here — `DEMO_ORDER` — but only `?demo=1`
 * reaches it, because the screen has to be openable without buying lunch first.
 *
 * Money is tiyin throughout, like everywhere else on this platform.
 */

/** Where the food is. The five rungs `dc.html:474-481` draws, in order. */
export type TrackStep = 'received' | 'confirmed' | 'cooking' | 'courier' | 'delivered';

export const TRACK_LADDER: readonly TrackStep[] = [
  'received',
  'confirmed',
  'cooking',
  'courier',
  'delivered',
];

/**
 * Minutes after placing that each rung was reached — `dc.html:891-896`.
 *
 * The design writes them as wall clocks (11:24 · 11:26 · 11:31 · 11:48 · 12:05)
 * against a fixture placed at 11:24. Stored as offsets so a real order stamps
 * its own clock: an order placed at 19:40 must not print 11:26 beside
 * "the kitchen confirmed it".
 */
export const STEP_MINUTES: readonly number[] = [0, 2, 7, 24, 41];

/** What is still to come, per rung, in minutes — `dc.html:1013`. */
export const STEP_ETA: readonly number[] = [38, 34, 26, 12, 0];

export type PlacedLine = {
  name: string;
  quantity: number;
  /** Tiyin, per one, as charged. Never re-read from the current menu. */
  unitPrice: number;
};

export type PlacedOrder = {
  /** `OX-2841` — the server's own bill number, printed and quoted on the phone. */
  number: string;
  /** Epoch milliseconds, from the bill's `placed_at`. Rung clocks derive from it. */
  placedAt: number;
  /**
   * The last four digits of the telephone that placed it.
   *
   * Half of the credential `GET /api/v1/public/orders/{number}` asks for — the
   * number is sequential per restaurant, so without this a stranger who guessed
   * `OX-0042` would read somebody else's address. Four digits and never the
   * whole number: this is `localStorage` on a device that gets lent and lost,
   * and four digits are all the endpoint checks.
   */
  phoneLastFour: string;
  /**
   * How far the kitchen has got, as the design's five rungs.
   *
   * The **fallback** rung now. A live order's rung comes from the API's own
   * `stage`, folded seven-to-five by `rungOf()`; this is what the screen shows
   * before the first poll answers, and what the demo control moves when there is
   * no live order behind it.
   */
  step: number;
  mode: 'delivery' | 'pickup';
  rail: string;
  /**
   * When it was asked for: `asap`, or one of the venue's pre-order sittings.
   *
   * Carried rather than dropped. A guest who chose 19:00 at eleven in the
   * morning has told the kitchen something, and a checkout that collects an
   * answer and throws it away is the same bug the booking form had with its
   * branch chooser.
   *
   * Sent as well as kept. `orders.scheduled_for` is a real column and
   * `PublicOrderRequest` declares it, so the checkout posts the sitting as an
   * ISO instant resolved against the VENUE's clock — see
   * `fetchSlotInstants()`, and see `PlaceOrderPayload.scheduled_for` for why
   * the conversion cannot happen in a browser.
   *
   * The free-text note goes with it and is deliberately not dropped: it is what
   * the person who rings the guest back reads, in the words the guest was
   * shown. This field is the label, kept locally so the tracking screen can
   * repeat what was asked for without a round trip.
   */
  when: string;
  /** Where it is going, or which branch it is collected from. */
  destination: string;
  lines: readonly PlacedLine[];
  /** Tiyin, what was actually charged — rounding already applied. */
  total: number;
  /** Tiyin, the VAT inside that total. Displayed, never added. */
  vatIncluded: number;
};

const keyFor = (restaurant: string) => `srcp.order.${restaurant}`;

const listeners = new Set<() => void>();

/*
 * One cached snapshot, replaced only when something changes.
 *
 * `useSyncExternalStore` compares by identity, so parsing localStorage on every
 * call would hand React a new object each time and loop forever — the same trap
 * `lib/guest-cart.ts` and the POS offline queue both document.
 */
let cached: { restaurant: string; order: PlacedOrder | null } = { restaurant: '', order: null };

function read(restaurant: string): PlacedOrder | null {
  if (typeof window === 'undefined') return null;

  if (cached.restaurant === restaurant) return cached.order;

  try {
    const raw = window.localStorage.getItem(keyFor(restaurant));

    cached = { restaurant, order: raw === null ? null : (JSON.parse(raw) as PlacedOrder) };
  } catch {
    /* A corrupt record is no record. It is one lunch, not a document. */
    cached = { restaurant, order: null };
  }

  return cached.order;
}

function write(restaurant: string, order: PlacedOrder | null) {
  cached = { restaurant, order };

  try {
    if (order === null) window.localStorage.removeItem(keyFor(restaurant));
    else window.localStorage.setItem(keyFor(restaurant), JSON.stringify(order));
  } catch {
    /* Private mode, or a full quota. The screen still works for this visit. */
  }

  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key.startsWith('srcp.order.')) {
      cached = { restaurant: '', order: null };
      listener();
    }
  };

  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function usePlacedOrder(restaurant: string): PlacedOrder | null {
  return useSyncExternalStore(
    subscribe,
    () => read(restaurant),
    () => null,
  );
}

/*
 * The demo order is memoised per language and never subscribes to anything.
 *
 * `useSyncExternalStore` rather than an effect, and the reason is the clock:
 * the fixture stamps `Date.now()` into its rung times, so a value computed
 * while rendering on the server can never match the one computed at hydration.
 * This hook returns `null` on the server pass and the fixture afterwards, which
 * is exactly what the store contract is for — and the cache keeps the snapshot
 * stable by identity, which is what stops React looping on it.
 */
const NO_SUBSCRIPTION = () => () => {};
const memo = new Map<SiteLocale, PlacedOrder>();

export function useDemoOrder(locale: SiteLocale, enabled: boolean): PlacedOrder | null {
  return useSyncExternalStore(
    NO_SUBSCRIPTION,
    () => {
      if (!enabled) return null;

      const made = memo.get(locale) ?? demoOrder(locale, nowMs());

      memo.set(locale, made);

      return made;
    },
    () => null,
  );
}

/**
 * The clock, read here rather than in a component.
 *
 * `Date.now()` is impure and the React compiler refuses it anywhere it cannot
 * prove is deferred — including inside an `onClick` written inline. It is only
 * a fallback now: a placed order carries the bill's own `placed_at`, and the
 * one thing a browser clock must never decide is when a restaurant took an
 * order.
 */
function nowMs(): number {
  return Date.now();
}

/**
 * What the checkout knows once the server has answered.
 *
 * The number and the clock are **not** in it — they are the bill's, and
 * `placeOrder` takes them from the placement response rather than minting them.
 * There used to be a `mintNumber()` here that made `OX-` plus four digits of
 * the epoch, and the reason it is gone is that a number invented in a browser
 * is not a receipt: two guests could hold the same one, no telephone call could
 * resolve it, and `GET /public/orders/{number}` would answer 404 for every one
 * of them.
 */
export type OrderDraft = Omit<PlacedOrder, 'step'>;

export function placeOrder(restaurant: string, draft: OrderDraft): PlacedOrder {
  const order: PlacedOrder = { ...draft, step: 0 };

  write(restaurant, order);

  return order;
}

/** The bill's own clock, or this device's when the server sent none. */
export function placedAtOf(iso: string | null | undefined): number {
  const at = iso == null ? Number.NaN : new Date(iso).getTime();

  return Number.isNaN(at) ? nowMs() : at;
}

/** Move one rung. Stops at the top rather than wrapping — `dc.html:1014`. */
export function advanceOrder(restaurant: string, order: PlacedOrder) {
  write(restaurant, { ...order, step: Math.min(TRACK_LADDER.length - 1, order.step + 1) });
}

export function forgetOrder(restaurant: string) {
  write(restaurant, null);
}

/**
 * When a rung was, or will be, reached — `HH:MM` on the reader's own clock.
 *
 * The **estimate**, from the design's offsets against this order's own start.
 * A live order overrides it rung by rung with the API's `reached_at`, which is
 * the moment the state was actually entered; this is what the other rungs show,
 * and it is why the offsets are still worth keeping — a guest reading "17:34"
 * beside "the courier collects it" is being told when to expect the door.
 */
export function stepClock(order: PlacedOrder, index: number, locale: SiteLocale): string {
  return clockOf(order.placedAt + (STEP_MINUTES[index] ?? 0) * 60_000, locale);
}

/** One instant as `HH:MM`, in the reader's own device clock. */
export function clockOf(at: number | string, locale: SiteLocale): string {
  const moment = new Date(at);

  if (Number.isNaN(moment.getTime())) return '';

  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(moment);
}

/**
 * The rider on a live order — `GET /api/v1/public/orders/{number}`, `courier`.
 *
 * Null until a dispatcher assigns one, and null forever on a collection order.
 * Three fields and no more, and the shape is the API's decision rather than
 * this screen's: the surname is dropped and the telephone is **masked**, because
 * a tracking link is guarded by a bill number and four digits — enough to stop a
 * stranger reading somebody's address, nowhere near enough to justify publishing
 * an employee's mobile number to whoever holds it.
 *
 * Which is why a live courier draws no call button. The design's card has one
 * and the design's courier has a dialable number; a `tel:+998 •• ••• 45 67` is a
 * button that opens a dialler with nothing in it. What a guest gets instead is
 * the name, the masked digits they can check a missed call against, and the
 * restaurant's own number in the header — see `track-screen.tsx`.
 */
export type LiveCourier = {
  name: string;
  monogram: string;
  /** `+998 •• ••• 45 67`. Never dialable, and never rendered as a link. */
  phoneMasked: string | null;
  etaMinutes: number | null;
};

/**
 * The courier, as the design draws him — `dc.html:495-503`.
 *
 * A name, a moped, a distance and a rating. The **demo** rider now: a real one
 * comes down with the order, and the two things this fixture has that the API
 * does not publish — a distance in kilometres and a rating — are the reason it
 * is still here rather than deleted. `?demo=1` is what reaches it, and the
 * design's own card is what it draws.
 */
export const COURIER = {
  name: 'Oybek Sattorov',
  /** Two initials, which is what the 44px circle holds. */
  monogram: 'OS',
  phone: '+998 90 123 45 67',
  /** Kilometres still to ride, as the design writes it. */
  distanceKm: '2.4',
  rating: '4.9',
} as const;

/**
 * The order the design itself tracks — `dc.html:1016-1021`.
 *
 * Reached only through `?demo=1`, and only when this browser has placed nothing.
 * It exists so the whole screen — rail, map, courier, lines, total — can be
 * opened and reviewed without buying lunch, and so the design's own arithmetic
 * (128 000 so'm across four lines) stays checkable against the file.
 */
const DEMO_LINES: readonly { name: Trilingual; quantity: number; unitPrice: number }[] = [
  {
    name: { uz: 'Toshkent oshi', ru: 'Ташкентский плов', en: 'Tashkent plov' },
    quantity: 2,
    unitPrice: som(45_000),
  },
  {
    name: { uz: 'Achichuk salat', ru: 'Салат ачичук', en: 'Achichuk salad' },
    quantity: 1,
    unitPrice: som(18_000),
  },
  {
    name: { uz: 'Tandir non', ru: 'Тандырная лепёшка', en: 'Tandoor bread' },
    quantity: 2,
    unitPrice: som(6_000),
  },
  {
    name: { uz: "Ko'k choy, choynak", ru: 'Зелёный чай, чайник', en: 'Green tea, pot' },
    quantity: 1,
    unitPrice: som(8_000),
  },
];

/** The design's address line for the demo order — `dc.html:1009`. */
const DEMO_DESTINATION: Trilingual = {
  uz: 'Chilonzor 24, 3-podyezd, 47-xonadon',
  ru: 'Чиланзар 24, подъезд 3, кв 47',
  en: 'Chilonzor 24, entrance 3, flat 47',
};

export function demoOrder(locale: SiteLocale, now: number): PlacedOrder {
  const lines = DEMO_LINES.map((line) => ({
    name: say(line.name, locale),
    quantity: line.quantity,
    unitPrice: line.unitPrice,
  }));

  const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

  return {
    number: 'OX-2841',
    /* No digits, and that is what keeps the fixture unable to reach the API:
       the tracking screen only polls when it holds four, so `?demo=1` draws the
       design's order and asks nobody about it. */
    phoneLastFour: '',
    /* Placed far enough back that the first three rungs already have clocks. */
    placedAt: now - STEP_MINUTES[2]! * 60_000,
    /* `step: 2` — the design opens on "cooking", the interesting rung. */
    step: 2,
    mode: 'delivery',
    rail: 'card',
    when: 'asap',
    destination: say(DEMO_DESTINATION, locale),
    lines,
    total,
    /* VAT is inside the price: extracted for display, never added. */
    vatIncluded: Math.round(total - total / (1 + VAT_PERCENT / 100)),
  };
}
