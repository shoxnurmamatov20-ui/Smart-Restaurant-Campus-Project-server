import type {
  PlaceOrderPayload,
  TrackedOrderEnvelope,
  TrackedOrderPayload,
} from '@restaurant/surfaces/customer/order';

import { Failure, del, get, post } from '../lib/api';
import type { Lang } from '../lib/locale';
import { erase, KEYS, read, write } from '../lib/storage';
import { customerTenant } from './live';

/**
 * The guest's own account, from a phone.
 *
 * Signing in, the profile, the address book, the loyalty shelf and the one
 * write a guest can make with no account at all — a review. Every screen in
 * `(customer)` that once stood on fixtures alone now reads from here.
 *
 * ---------------------------------------------------------------------------
 * Where the token lives, and why not where the browser keeps it
 *
 * `KEYS.session`, which is `SecureStore` — the Keychain on iOS, the Keystore on
 * Android. The web build hides the same token in an httpOnly cookie the page
 * cannot read; a native app has no such place, and `AsyncStorage` is a plain
 * file another app on a rooted device can read. A phone is the surface somebody
 * can take away with them, and this token is good for ninety days.
 *
 * ---------------------------------------------------------------------------
 * These functions answer rather than throw
 *
 * `lib/api.ts` throws a typed `Failure`, which is right for a screen that has to
 * say "could not reach the restaurant, retry". These wrap it, because the
 * sign-in screen has a different job: "kod noto'g'ri", "the code expired" and
 * "too many attempts" are three different things for a person to do next, and
 * the error catalogue already tells them apart in three languages. A screen that
 * caught an exception and printed one sentence would flatten all three.
 */

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

  // `ApiError` in @restaurant/types is the envelope's inner object; the three
  // sentences ride on it, and the caller picks the reader's own.
  const body = (error.body ?? {}) as Envelope;

  return {
    ok: false,
    code: body.code ?? (error.status === 0 ? 'offline' : 'rejected'),
    message:
      (lang === 'ru' ? body.message_ru : lang === 'en' ? body.message_en : body.message_uz) ?? null,
    retryAfter: body.retry_after,
  };
}

/** The scope every public call shares: this restaurant, this language. */
const anonymous = (lang: Lang) => ({ tenant: customerTenant(), locale: lang, bearer: null });
const asGuest = (lang: Lang) => ({ tenant: customerTenant(), locale: lang });

/* ============================================================
   Signing in
   ============================================================ */

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

export async function requestCode(
  phone: string,
  lang: Lang,
): Promise<Answer<{ data: { expires_in: number; retry_after: number } }>> {
  try {
    const sent = await post<{ data: { expires_in: number; retry_after: number } }>(
      '/public/auth/otp',
      { phone, locale: lang },
      anonymous(lang),
    );

    return { ok: true, ...sent };
  } catch (error) {
    return failed(error, lang);
  }
}

/**
 * The code, for a session.
 *
 * The token is written to the Keychain before this returns, so a screen that
 * navigates on success finds a signed-in app rather than one that is about to
 * be.
 */
export async function verifyCode(
  phone: string,
  code: string,
  lang: Lang,
  name?: string,
): Promise<Answer<{ data: Profile }>> {
  try {
    const session = await post<{ token: string; data: Profile }>(
      '/public/auth/otp/verify',
      { phone, code, locale: lang, name, device_name: 'customer-app' },
      anonymous(lang),
    );

    await write(KEYS.session, session.token);

    return { ok: true, data: session.data };
  } catch (error) {
    return failed(error, lang);
  }
}

/** Null when nobody is signed in on this phone, or the session has run out. */
export async function readProfile(lang: Lang): Promise<Profile | null> {
  if ((await read(KEYS.session)) === null) return null;

  try {
    const me = await get<{ data: Profile }>('/public/me', asGuest(lang));

    return me.data;
  } catch (error) {
    /*
     * A dead token is cleared rather than kept.
     *
     * Ninety days is long enough that the other end of it is a real event, and
     * a phone that keeps sending a token the server has stopped honouring gets
     * a 401 on every screen with no way to notice. Anything else — no network,
     * a restarting API — leaves the session alone: it is almost certainly still
     * good.
     */
    if (error instanceof Failure && (error.status === 401 || error.status === 403)) {
      await erase(KEYS.session);
    }

    return null;
  }
}

export async function signOut(lang: Lang): Promise<void> {
  try {
    await del('/public/me/session', asGuest(lang));
  } catch {
    // The token is gone from this phone whatever the server said. The worst
    // case is one the server still honours that nobody holds.
  }

  await erase(KEYS.session);
}

/* ============================================================
   Addresses
   ============================================================ */

export type Address = {
  id: number;
  label: string;
  line: string;
  note: string | null;
  full_line: string;
  is_default: boolean;
};

export async function listAddresses(lang: Lang): Promise<Address[] | null> {
  if ((await read(KEYS.session)) === null) return null;

  try {
    const answer = await get<{ data: Address[] }>('/public/addresses', asGuest(lang));

    return answer.data;
  } catch {
    return null;
  }
}

export async function addAddress(
  lang: Lang,
  address: { label: string; line: string },
): Promise<Answer<{ data: Address }>> {
  try {
    const saved = await post<{ data: Address }>('/public/addresses', address, asGuest(lang));

    return { ok: true, ...saved };
  } catch (error) {
    return failed(error, lang);
  }
}

export async function removeAddress(lang: Lang, id: number): Promise<Answer<object>> {
  try {
    await del(`/public/addresses/${id}`, asGuest(lang));

    return { ok: true };
  } catch (error) {
    return failed(error, lang);
  }
}

/* ============================================================
   The loyalty shelf
   ============================================================ */

export type ShelfCoupon = {
  id: number;
  key: string;
  name: Record<Lang, string>;
  note: Record<Lang, string> | null;
  points_cost: number;
  tone: 'accent' | 'brand' | 'warning';
};

export type Shelf = { coupons: ShelfCoupon[]; points: number; held: number[] };

export async function readShelf(lang: Lang): Promise<Shelf | null> {
  if ((await read(KEYS.session)) === null) return null;

  try {
    const answer = await get<{
      data: ShelfCoupon[];
      meta: { points: number; held_coupon_ids: number[] };
    }>('/public/coupons', asGuest(lang));

    return { coupons: answer.data, points: answer.meta.points, held: answer.meta.held_coupon_ids };
  } catch {
    return null;
  }
}

export async function reserveCoupon(
  lang: Lang,
  id: number,
): Promise<Answer<{ data: { code: string }; meta: { points: number } }>> {
  try {
    const taken = await post<{ data: { code: string }; meta: { points: number } }>(
      `/public/coupons/${id}/reserve`,
      undefined,
      asGuest(lang),
    );

    return { ok: true, ...taken };
  } catch (error) {
    return failed(error, lang);
  }
}

/* ============================================================
   The basket, and saying something went wrong
   ============================================================ */

export type PromoAnswer = {
  code: string;
  kind: 'percent' | 'fixed' | 'free_delivery';
  value: number;
  discount_tiyin: number;
};

/**
 * Is this word worth anything on this basket?
 *
 * The token rides along when there is one — a per-customer limit needs a
 * customer to count against, and a reserved loyalty coupon is personal — and
 * the call still works without it, because a guest may type a code before they
 * ever sign in.
 */
export async function checkPromo(
  lang: Lang,
  code: string,
  subtotalTiyin: number,
): Promise<Answer<{ data: PromoAnswer }>> {
  try {
    const answer = await post<{ data: PromoAnswer }>(
      '/public/promo-codes/check',
      { code, subtotal_tiyin: subtotalTiyin },
      asGuest(lang),
    );

    return { ok: true, ...answer };
  } catch (error) {
    return failed(error, lang);
  }
}

/**
 * A review, with or without an account.
 *
 * `signedIn` is not a parameter: the API reads the token when one is offered
 * and carries on when it is not, which is what lets a guest at a table say the
 * soup was cold. `asGuest` sends whatever is in the Keychain, and an expired
 * token loses the attribution rather than the review.
 */
export async function sendFeedback(
  lang: Lang,
  report: {
    score: number;
    comment?: string;
    aspect?: string;
    table_id?: number;
    guest_name?: string;
    guest_phone?: string;
  },
  /*
   * Which restaurant, when it is not this build's own.
   *
   * The QR surface takes the tenant from the sticker's URL — a guest scanning a
   * table is at whatever restaurant the sticker belongs to, which need not be
   * the one this consumer build serves. Sending the wrong slug would file the
   * review against the wrong business, on the one surface with no login to
   * catch it.
   */
  tenant?: string,
): Promise<Answer<{ data: { id: number; urgent: boolean } }>> {
  try {
    const left = await post<{ data: { id: number; urgent: boolean } }>(
      '/public/feedback',
      report,
      tenant === undefined ? asGuest(lang) : { ...asGuest(lang), tenant },
    );

    return { ok: true, ...left };
  } catch (error) {
    return failed(error, lang);
  }
}

/* ============================================================
   Ordering, and finding out where it is
   ============================================================ */

/**
 * What the server answers a placement with. The money is its, not the client's.
 *
 * Every figure here comes back rather than going up: the request carries ids,
 * quantities and the promo WORD, and the API prices all of it — including
 * re-pricing the code, which is why `promo` can be null on a code the cart drew
 * a discount for. That is not a failure and does not stop the order; it is a
 * sentence the guest is owed.
 */
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
 * Turn a basket into a bill — `POST /api/v1/public/orders`.
 *
 * Signed in is optional and stays optional: ordering dinner works for a
 * stranger with a phone, which is the whole point of the endpoint. `asGuest`
 * sends whatever token is in the Keychain, and a guest who has one gets three
 * things a stranger does not — their personal coupons are visible, a
 * per-customer campaign limit can be counted against them, and the bill lands
 * on their own order history rather than beside it.
 *
 * The body is built by `placeOrderPayloadFrom()` in `@restaurant/surfaces`,
 * which refuses a basket that cannot be ordered rather than letting the server
 * refuse it at the last tap.
 */
export async function placeOrder(
  lang: Lang,
  payload: PlaceOrderPayload,
): Promise<Answer<{ data: PlacedOrder }>> {
  try {
    const placed = await post<{ data: PlacedOrder }>('/public/orders', payload, asGuest(lang));

    return { ok: true, ...placed };
  } catch (error) {
    return failed(error, lang);
  }
}

/**
 * Where is my order — `GET /api/v1/public/orders/{number}`.
 *
 * Two credentials and neither is a session: the bill number, and the last four
 * digits of the phone that placed it. The pair is deliberate — bill numbers are
 * sequential per restaurant, so an endpoint answering on the number alone would
 * hand a stranger somebody's address and dinner one keystroke at a time.
 *
 * The digits ride in `X-Guest-Phone` rather than in `?phone=`. Both are
 * accepted; only one of them stays out of the access log of every proxy between
 * this phone and the restaurant.
 */
export async function trackOrder(
  lang: Lang,
  number: string,
  phone: string,
): Promise<Answer<TrackedOrderEnvelope>> {
  try {
    const answer = await get<TrackedOrderEnvelope>(`/public/orders/${encodeURIComponent(number)}`, {
      ...anonymous(lang),
      headers: { 'X-Guest-Phone': phone.replace(/\D/g, '').slice(-4) },
    });

    return { ok: true, ...answer };
  } catch (error) {
    return failed(error, lang);
  }
}

/**
 * Everything this guest has ordered here — `GET /api/v1/public/orders`.
 *
 * Signed in only, and refused with `order.sign_in_required` otherwise: a list
 * keyed by phone number would hand somebody's whole ordering history to anybody
 * who knows their number, which in this country is most of a receipt. The
 * profile screen has been drawing three invented rows under a live order count,
 * and this is the list behind the figure.
 */
export async function myOrders(lang: Lang): Promise<Answer<{ data: TrackedOrderPayload[] }>> {
  try {
    const answer = await get<{ data: TrackedOrderPayload[] }>('/public/orders', asGuest(lang));

    return { ok: true, ...answer };
  } catch (error) {
    return failed(error, lang);
  }
}
