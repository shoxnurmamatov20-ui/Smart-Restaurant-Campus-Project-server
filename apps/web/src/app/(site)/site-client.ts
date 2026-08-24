'use client';

import {
  placeOrderPayloadFrom,
  type PlaceOrderInput,
  type TrackedOrderPayload,
} from '@restaurant/surfaces/customer/order';

/**
 * The restaurant site talking to its own origin.
 *
 * The browser half of this surface, and the sibling of
 * `(customer)/customer-client.ts` — same three calls, same rails, deliberately
 * not a second set of route handlers. `/api/public/orders`,
 * `/api/public/orders/{number}` and `/api/customer/promo` already exist and
 * already do the three things a write from a browser has to do here:
 *
 *   **the key.** Every mutating route under `/api/v1/public/*` sits in the
 *   `tenant` middleware group and is refused without an `Idempotency-Key`. A
 *   guest on a lift's worth of signal taps "Buyurtma berish" twice, and without
 *   it the kitchen cooks two dinners and somebody pays for both.
 *
 *   **the restaurant.** The handlers turn the host — or the build's default
 *   tenant — into `X-Tenant`, which is how an endpoint with no session knows
 *   whose kitchen it is talking about.
 *
 *   **the 419.** A request from the browser straight to Laravel counts as
 *   stateful under `SANCTUM_STATEFUL_DOMAINS` and is refused for want of a CSRF
 *   token. From Node there is no Origin and no cookie.
 *
 * Nothing here throws. Every function answers a discriminated result, because
 * every caller is a click handler and a rejected promise inside one is a button
 * that silently did nothing — with a basket behind it.
 *
 * ---------------------------------------------------------------------------
 * The money only ever comes back
 *
 * The body carries ids, quantities and words. Not a unit price, not a discount,
 * not a total: `PublicOrderRequest` refuses all three by not declaring them, and
 * re-prices every line through `App\Contracts\Menu\MenuCatalog` inside the
 * transaction. What this file sends up is what only the guest knows; what it
 * reads back is what only the restaurant may decide.
 */

export type Refusal = { ok: false; error: string; message?: string };
export type Answer<T> = ({ ok: true } & T) | Refusal;

/** What `POST /api/v1/public/orders` answers with. Money is the server's. */
export type PlacedOrderAnswer = {
  id: number;
  number: string;
  status: string;
  channel: string;
  branch: { id: number; name: string } | null;
  payment: { method: string | null; state: string | null };
  subtotal: number;
  discount_total: number;
  service_charge: number;
  delivery_fee: number;
  vat_included: number;
  total: number;
  promo: { code: string; kind: string; value: number; discount_tiyin: number } | null;
  eta_minutes: number | null;
  promised_at: string | null;
  placed_at: string | null;
};

/**
 * Place the basket.
 *
 * `placeOrderPayloadFrom` builds the body and answers `null` when this basket
 * cannot become an order — a dish id that is not a number, which is what a
 * basket filled against the fixtures carries, or a delivery with no address.
 * That refusal is the useful one: it happens **before** the guest commits
 * rather than as a 422 after, so the checkout can point at the field or say the
 * menu is a sample.
 */
export async function placeSiteOrder(
  input: PlaceOrderInput,
  lang: string,
): Promise<Answer<{ data: PlacedOrderAnswer }>> {
  const body = placeOrderPayloadFrom(input);

  if (body === null) return { ok: false, error: 'not_orderable' };

  return call<{ data: PlacedOrderAnswer }>(`/api/public/orders?lang=${encodeURIComponent(lang)}`, {
    method: 'POST',
    body,
  });
}

/**
 * The tracking payload, with the two courier fields this surface draws.
 *
 * `TrackedOrderPayload` in the surfaces package describes the same endpoint for
 * the customer app, which shows a rider's name and vehicle. The site's card
 * shows the masked telephone instead — see `PlacedOrder`'s `LiveCourier` for
 * why a rider's real number is not published — so the shape is widened here
 * rather than in the shared package: one screen's extra field is not a reason
 * to change what the phone app compiles against.
 */
export type SiteTrackedOrder = Omit<TrackedOrderPayload, 'courier'> & {
  courier?: {
    name?: string;
    /** `+998 •• ••• 45 67`. Never dialable. */
    phone_masked?: string | null;
    status?: string | null;
    eta_minutes?: number | null;
  } | null;
};

/**
 * Where the order is — `GET /api/v1/public/orders/{number}`.
 *
 * Two credentials and neither is a session: the bill number, and the last four
 * digits of the telephone that placed it. The number alone is sequential per
 * restaurant, so `OX-0041` would be one keystroke from somebody else's address.
 *
 * The digits go in a header rather than the query string, because a telephone
 * number in a URL is a telephone number in every proxy log between here and the
 * guest. The handler forwards the header under the same name.
 */
export async function trackSiteOrder(
  number: string,
  phoneLastFour: string,
): Promise<Answer<{ data: SiteTrackedOrder }>> {
  return call<{ data: SiteTrackedOrder }>(`/api/public/orders/${encodeURIComponent(number)}`, {
    method: 'GET',
    headers: { 'X-Guest-Phone': phoneLastFour },
  });
}

/** What the promo check answers. `discount_tiyin` is the only figure that counts. */
export type PromoAnswer = {
  code: string;
  kind: 'percent' | 'fixed' | 'free_delivery';
  value: number;
  title?: string;
  discount_tiyin: number;
  free_delivery?: boolean;
};

/**
 * Is this word worth anything on this basket?
 *
 * The server decides, and it decides twice: once here so the summary can show
 * what the code is worth, and again inside `POST /public/orders` against the
 * basket the server itself built. A client that priced its own discount would
 * be a client that priced its own dinner — so what comes back from here is
 * shown, and what reaches the bill is the code as a string.
 *
 * `/api/customer/promo` rather than a handler of this surface's own: it already
 * forwards the guest's cookie when there is one, which is what lets a personal
 * loyalty coupon (`SR…`) be recognised as well as a campaign code.
 */
export async function checkSitePromo(
  code: string,
  subtotalTiyin: number,
  lang: string,
): Promise<Answer<{ data: PromoAnswer }>> {
  return call<{ data: PromoAnswer }>(`/api/customer/promo?lang=${encodeURIComponent(lang)}`, {
    method: 'POST',
    body: { code, subtotal_tiyin: subtotalTiyin },
  });
}

async function call<T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string> },
): Promise<Answer<T>> {
  let response: Response;

  try {
    response = await fetch(path, {
      method: init.method,
      headers: {
        ...(init.headers ?? {}),
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });
  } catch {
    // The network, not the API. Kept apart from a refusal because the two need
    // different words: one is "try again", the other is "this cannot be done".
    return { ok: false, error: 'offline' };
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok) {
    /*
     * The API's own code and its own sentence, in the reader's language.
     *
     * "Manti hozir mavjud emas", "the basket is below the minimum" and "too
     * many open orders on this number" are three different things to do next,
     * and the error catalogue already tells them apart in three languages.
     * Flattening them to "order failed" leaves somebody pressing the same
     * button.
     */
    return {
      ok: false,
      error: typeof payload?.error === 'string' ? payload.error : 'rejected',
      message: typeof payload?.message === 'string' ? payload.message : undefined,
    };
  }

  return { ok: true, ...(payload as T) };
}

/* ============================================================
   The ladder, seven rungs down to five
   ============================================================ */

/**
 * Which of the design's five rungs an order's status is on.
 *
 * `PublicOrderController::FULFILMENT_LADDER` has seven — placed, accepted,
 * cooking, ready, enroute, served, handed — and `dc.html:474-481` draws five.
 * The mapping is a screen decision rather than a data one, exactly as
 * `customer/order.ts` maps its own four:
 *
 *   `ready` folds into **cooking**, because "plated and waiting on the pass" is
 *   still the kitchen from a guest's chair — the rung they are watching for is
 *   the one where it leaves the building.
 *   `served` folds into **delivered**, because a takeaway is handed over rather
 *   than carried, and both mean the guest has the food.
 *
 * `null` for a status the ladder does not contain — a `draft` waiting on an
 * online payment, a `voided` bill, a `refunded` one. The screen then keeps the
 * rung it already had rather than drawing "step 0 of 5" for an order that will
 * never be cooked.
 */
const RUNG_OF: Readonly<Record<string, number>> = {
  placed: 0,
  accepted: 1,
  cooking: 2,
  ready: 2,
  enroute: 3,
  served: 4,
  handed: 4,
};

export function rungOf(status: string): number | null {
  return RUNG_OF[status] ?? null;
}

/**
 * When each of the five rungs was actually reached, as `HH:MM`.
 *
 * `reached_at` is keyed by the API's own seven state names and is the first
 * time each was entered — "a bill dragged back and forth by a manager still
 * says when the food was ready". Folded onto the five here with first-write
 * wins, so `ready` cannot overwrite the moment the kitchen started cooking with
 * a later one the guest saw nothing happen at.
 *
 * @param clock Formats an ISO instant. Passed in rather than read, so the
 *   caller owns the reader's locale and a test can check an exact minute.
 */
export function rungClocks(
  reachedAt: Readonly<Record<string, string>> | undefined,
  clock: (iso: string) => string,
): Readonly<Record<number, string>> {
  const times: Record<number, string> = {};

  for (const [status, iso] of Object.entries(reachedAt ?? {})) {
    const rung = rungOf(status);

    if (rung !== null && times[rung] === undefined && iso !== '') times[rung] = clock(iso);
  }

  return times;
}

/** The last four digits of a telephone number, which is what tracking asks for. */
export function lastFour(phone: string): string {
  return phone.replace(/\D+/g, '').slice(-4);
}
