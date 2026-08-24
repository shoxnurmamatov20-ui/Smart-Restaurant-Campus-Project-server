/**
 * The customer app talking to its own origin.
 *
 * Every call here goes to a Next route handler under `/api/customer/*`, never
 * to Laravel directly, and the reason is the token: a guest's session is good
 * for ninety days and reaches their profile, addresses and order history, so it
 * lives in an httpOnly cookie that this file cannot read and does not need to.
 * The handler attaches it. See `lib/customer-gateway.ts` for the other three
 * reasons — the idempotency key, the tenant that is not in the URL, and the 419
 * a browser→Laravel call earns from `SANCTUM_STATEFUL_DOMAINS`.
 *
 * ---------------------------------------------------------------------------
 * Nothing here throws
 *
 * Every function answers `{ ok: true, … }` or `{ ok: false, error, message }`.
 * These are screens a person is standing in front of with a basket, and an
 * unhandled rejection in a click handler is a button that does nothing — the
 * one outcome `design-rules.test.ts` exists to prevent. The message comes from
 * the API in the reader's language, because "kod noto'g'ri", "the code expired"
 * and "too many attempts" are three different things to do next.
 */

import type { Lang } from '@restaurant/surfaces/customer/data';
import type {
  PlaceOrderPayload,
  TrackedOrderEnvelope,
  TrackedOrderPayload,
} from '@restaurant/surfaces/customer/order';

export type Failure = { ok: false; error: string; message?: string; retryAfter?: number };
export type Result<T> = ({ ok: true } & T) | Failure;

async function call<T>(
  path: string,
  lang: Lang,
  init?: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown },
): Promise<Result<T>> {
  try {
    const response = await fetch(`/api/customer/${path}?lang=${lang}`, {
      method: init?.method ?? 'GET',
      headers: init?.body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });

    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok) {
      return {
        ok: false,
        error: typeof payload?.error === 'string' ? payload.error : 'rejected',
        message: typeof payload?.message === 'string' ? payload.message : undefined,
        retryAfter: typeof payload?.retryAfter === 'number' ? payload.retryAfter : undefined,
      };
    }

    return { ok: true, ...(payload as T) };
  } catch {
    // The phone lost the network mid-tap. Distinguished from a refusal because
    // the two need different words: one is "try again", the other is "that code
    // is wrong".
    return { ok: false, error: 'offline' };
  }
}

/* ============================================================
   Signing in
   ============================================================ */

export type OtpSent = { data: { expires_in: number; retry_after: number; code_length: number } };

export function requestCode(phone: string, lang: Lang): Promise<Result<OtpSent>> {
  return call<OtpSent>('otp', lang, { method: 'POST', body: { phone, locale: lang } });
}

/** What the API calls a guest — the profile screen's own shape. */
export type Profile = {
  id: number;
  name: string | null;
  phone: string;
  locale: Lang | null;
  points: number;
  tier: string;
  orders_count: number;
  total_spent: number;
  addresses?: Address[];
};

export function verifyCode(
  phone: string,
  code: string,
  lang: Lang,
  name?: string,
): Promise<Result<{ data: Profile }>> {
  return call<{ data: Profile }>('session', lang, {
    method: 'POST',
    body: { phone, code, locale: lang, name, device_name: 'customer-web' },
  });
}

export function readProfile(lang: Lang): Promise<Result<{ data: Profile }>> {
  return call<{ data: Profile }>('session', lang);
}

export function signOut(lang: Lang): Promise<Result<Record<string, never>>> {
  return call('session', lang, { method: 'DELETE' });
}

/* ============================================================
   Addresses
   ============================================================ */

export type Address = {
  id: number;
  label: string;
  line: string;
  entrance: string | null;
  floor: string | null;
  flat: string | null;
  note: string | null;
  full_line: string;
  is_default: boolean;
};

export function listAddresses(lang: Lang): Promise<Result<{ data: Address[] }>> {
  return call<{ data: Address[] }>('addresses', lang);
}

export function addAddress(
  lang: Lang,
  address: { label: string; line: string; is_default?: boolean },
): Promise<Result<{ data: Address }>> {
  return call<{ data: Address }>('addresses', lang, { method: 'POST', body: address });
}

export function removeAddress(lang: Lang, id: number): Promise<Result<Record<string, never>>> {
  return call(`addresses/${id}`, lang, { method: 'DELETE' });
}

/* ============================================================
   The basket and the loyalty shelf
   ============================================================ */

export type PromoAnswer = {
  data: {
    code: string;
    kind: 'percent' | 'fixed' | 'free_delivery';
    value: number;
    discount_tiyin: number;
    free_delivery?: boolean;
  };
};

export function checkPromo(
  lang: Lang,
  code: string,
  subtotalTiyin: number,
): Promise<Result<PromoAnswer>> {
  return call<PromoAnswer>('promo', lang, {
    method: 'POST',
    body: { code, subtotal_tiyin: subtotalTiyin },
  });
}

export type ShelfCoupon = {
  id: number;
  key: string;
  name: Record<Lang, string>;
  note: Record<Lang, string> | null;
  points_cost: number;
  tone: 'accent' | 'brand' | 'warning';
  ends_at: string | null;
};

export type Shelf = { data: ShelfCoupon[]; meta: { points: number; held_coupon_ids: number[] } };

export function readCoupons(lang: Lang): Promise<Result<Shelf>> {
  return call<Shelf>('coupons', lang);
}

export function reserveCoupon(
  lang: Lang,
  id: number,
): Promise<Result<{ data: { code: string; points_spent: number }; meta: { points: number } }>> {
  return call(`coupons/${id}/reserve`, lang, { method: 'POST' });
}

/* ============================================================
   Saying something went wrong
   ============================================================ */

export function sendFeedback(
  lang: Lang,
  report: {
    score: number;
    comment?: string;
    aspect?: string;
    order_number?: string;
    /**
     * The 22 characters printed on the table's sticker, when the review was
     * left at one. Never an id: an id in a URL is a small integer, and the next
     * small integer is somebody else's table. The controller resolves it
     * through `App\Contracts\Tables\FloorBoard`.
     */
    table_token?: string;
  },
): Promise<Result<{ data: { id: number; urgent: boolean } }>> {
  return call('feedback', lang, { method: 'POST', body: report });
}

/* ============================================================
   Orders
   ============================================================ */

/**
 * Place the basket — `POST /api/v1/public/orders`, through Node.
 *
 * The only call in this file that does NOT go through `/api/customer/*`, and
 * the difference is the point: ordering dinner works signed out. The handler at
 * `/api/public/orders` forwards the cookie when there is one — which is what
 * links the bill to a guest's history and lets the server see their personal
 * coupons — and works without it.
 *
 * Everything that is money comes back rather than going up. The body carries
 * ids and quantities; the response carries the totals the server computed, and
 * `promo` says what the code was actually worth. A screen that trusted its own
 * arithmetic here is a screen that shows one number and charges another.
 */
export async function placeOrder(
  lang: Lang,
  payload: PlaceOrderPayload,
): Promise<Result<{ data: PlacedOrder }>> {
  try {
    const response = await fetch(`/api/public/orders?lang=${lang}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok) {
      return {
        ok: false,
        error: typeof body?.error === 'string' ? body.error : 'rejected',
        message: typeof body?.message === 'string' ? body.message : undefined,
      };
    }

    return { ok: true, ...(body as { data: PlacedOrder }) };
  } catch {
    return { ok: false, error: 'offline' };
  }
}

/** What the server answers a placement with. Money is its, not the client's. */
export type PlacedOrder = {
  /** What `POST /public/payments/invoice` names the bill by, beside its number. */
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
  /** Null when the code was worth nothing — an expired campaign, a spent coupon. */
  promo: {
    code: string;
    kind: string;
    value: number;
    discount_tiyin: number;
    free_delivery: boolean;
  } | null;
  eta_minutes: number | null;
  promised_at: string | null;
};

/**
 * Where is my order — `GET /api/v1/public/orders/{number}`.
 *
 * Two credentials and neither is a session: the bill number, and the last four
 * digits of the phone that placed it. The number alone is sequential per
 * restaurant, so `A-0041` is one keystroke from somebody else's address.
 *
 * The handler wants the digits in a header rather than the query string,
 * because a phone number in a URL is a phone number in a proxy log.
 */
export async function trackOrder(
  number: string,
  phoneLastFour: string,
): Promise<Result<TrackedOrderEnvelope>> {
  try {
    const response = await fetch(`/api/public/orders/${encodeURIComponent(number)}`, {
      headers: { 'X-Guest-Phone': phoneLastFour },
      cache: 'no-store',
    });

    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok) {
      return { ok: false, error: typeof body?.error === 'string' ? body.error : 'unknown_order' };
    }

    return { ok: true, ...(body as TrackedOrderEnvelope) };
  } catch {
    return { ok: false, error: 'offline' };
  }
}

/**
 * Everything this guest has ordered here — `GET /api/v1/public/orders`.
 *
 * Signed in only, and the handler refuses locally without the cookie. The
 * profile screen has been drawing `ORDER_HISTORY` under a live `orders_count`,
 * so the figure was real and the three rows under it were invented.
 */
export async function myOrders(lang: Lang): Promise<Result<{ data: TrackedOrderPayload[] }>> {
  return call<{ data: TrackedOrderPayload[] }>('orders', lang);
}
