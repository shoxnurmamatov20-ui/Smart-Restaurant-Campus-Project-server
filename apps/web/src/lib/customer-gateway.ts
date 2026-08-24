import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

import { guestTenant } from '@/lib/api-server';
import { apiBase, SESSION_COOKIE_SECURE } from '@/lib/server-session';

/**
 * The customer app's own door to the API, from Node.
 *
 * Everything the consumer app writes goes through here for the three reasons
 * `app/api/public/orders/route.ts` already sets out — the idempotency key, the
 * tenant that is not in the URL, and the 419 a browser→Laravel call earns from
 * `SANCTUM_STATEFUL_DOMAINS` — plus a fourth that only applies once a guest has
 * signed in:
 *
 * **The token must not be readable by the page.** A customer token is good for
 * ninety days and reaches that person's profile, addresses and order history.
 * Held in `localStorage` it is one injected script away from being somebody
 * else's; held in an httpOnly cookie it is not readable at all, and the page
 * never has to hold it to use it.
 *
 * That is the same decision `lib/server-session.ts` makes for the console, and
 * it is a *separate cookie* on purpose. One person may be a guest of this
 * restaurant and a member of its staff, and signing out of one must not sign
 * them out of the other — exactly as the till's three cookies are deliberately
 * not mixed (CLAUDE.md, "Uchta hisob ma'lumoti, uchta cookie").
 */

/** Who the guest is. Ninety days, httpOnly, never read by the page. */
export const CUSTOMER_COOKIE = 'restaurant-campus-customer';

/**
 * Ninety days, matching `auth.otp.token_days` on the server.
 *
 * Long on purpose: this is a consumer app on a personal phone, and a customer
 * signed out every fortnight orders from a competitor rather than waiting for
 * another SMS. The cookie must not outlive the token behind it — a browser
 * still sending a dead token gets a 401 on every screen with no way to notice
 * — so if one number changes, both do.
 */
export const CUSTOMER_MAX_AGE = 60 * 60 * 24 * 90;

export type Lang = 'uz' | 'ru' | 'en';

/** The language this request is being read in, from `?lang=`. */
export function localeOf(request: NextRequest): Lang {
  const asked = request.nextUrl.searchParams.get('lang');

  return asked === 'ru' || asked === 'en' ? asked : 'uz';
}

/** The signed-in guest's token, or undefined. Never leaves the server. */
export async function customerToken(): Promise<string | undefined> {
  return (await cookies()).get(CUSTOMER_COOKIE)?.value;
}

export const CUSTOMER_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: SESSION_COOKIE_SECURE,
  path: '/',
  maxAge: CUSTOMER_MAX_AGE,
};

/** What Laravel answers a refusal with — see App\Support\Errors\ErrorResponse. */
type ApiFailure = {
  error?: {
    code?: string;
    message_uz?: string;
    message_ru?: string;
    message_en?: string;
    errors?: Record<string, string[]>;
    retry_after?: number;
  };
};

/**
 * Forward one call to `/api/v1/public/*` and hand the answer back.
 *
 * `signedIn: true` attaches the guest's bearer token; `signedIn: 'optional'`
 * attaches it when there is one and carries on when there is not — which is
 * what the feedback form needs, because a guest at a table has no account and
 * their complaint still counts.
 */
export async function forward(
  request: NextRequest,
  path: string,
  init: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    signedIn?: true | 'optional';
    /**
     * Which restaurant, when the caller knows better than the host does.
     *
     * The QR surface is the only one that does: the sticker's URL carries the
     * slug (`/qr/{restaurant}/{table}`), and one host serves every
     * restaurant's stickers — so resolving from the host would file a review
     * against whichever tenant the deployment defaults to. `guestTenant()`
     * takes the explicit value and falls back to the host exactly as
     * `apiPublicGet` does for the menu.
     */
    tenant?: string;
  },
): Promise<NextResponse> {
  const tenant = await guestTenant(init.tenant);

  if (tenant === null) {
    return NextResponse.json({ error: 'unknown_restaurant' }, { status: 404 });
  }

  const token = init.signedIn === undefined ? undefined : await customerToken();

  if (init.signedIn === true && token === undefined) {
    // Answered here rather than upstream: the API's refusal would be identical,
    // and a round trip to be told what this process already knows is a round
    // trip on a phone's connection.
    return NextResponse.json({ error: 'crm.customer_token_required' }, { status: 401 });
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Tenant': tenant,
    'X-Locale': localeOf(request),
  };

  if (token !== undefined) headers.Authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';

  /*
   * A fresh key per attempt, minted here rather than accepted from the client.
   *
   * A client that chooses its own key can reuse one, and a reused key on a
   * changed body is refused as a conflict — which reads to a guest as "it
   * failed" when it was in fact refused for being different. A person who
   * presses again after an error means it, and gets a new key.
   */
  if (init.method !== 'GET') headers['Idempotency-Key'] = crypto.randomUUID();

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  const payload = (await upstream.json().catch(() => null)) as (ApiFailure & object) | null;

  if (!upstream.ok) {
    return NextResponse.json(refusal(payload, localeOf(request)), { status: upstream.status });
  }

  return NextResponse.json(payload ?? {}, { status: upstream.status });
}

/**
 * The API's own sentence, in the reader's language.
 *
 * "Kod noto'g'ri", "the code has expired" and "too many attempts, wait fifteen
 * minutes" are three different things to do next, and the catalogue already
 * tells them apart in three languages. Flattening them to "sign-in failed"
 * leaves somebody pressing the same button.
 */
export function refusal(
  payload: ApiFailure | null,
  locale: Lang,
): { error: string; message?: string; retryAfter?: number } {
  const error = payload?.error;
  const firstField = Object.values(error?.errors ?? {})[0]?.[0];

  return {
    error: error?.code ?? 'rejected',
    message:
      firstField ??
      (locale === 'ru' ? error?.message_ru : locale === 'en' ? error?.message_en : undefined) ??
      error?.message_uz,
    retryAfter: error?.retry_after,
  };
}
