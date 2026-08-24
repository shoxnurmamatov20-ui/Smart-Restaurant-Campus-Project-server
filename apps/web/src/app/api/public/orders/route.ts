import { NextResponse, type NextRequest } from 'next/server';

import { guestTenant } from '@/lib/api-server';
import { customerToken } from '@/lib/customer-gateway';
import { apiBase } from '@/lib/server-session';

/**
 * Placing an order, forwarded from Node.
 *
 * The customer app's one write, and it goes the same way every other write on
 * this platform does — for the three reasons the booking form's handler
 * already sets out, all of which apply harder here:
 *
 * **The key.** `POST /api/v1/public/orders` sits in the `tenant` middleware
 * group and requires an `Idempotency-Key`. That is not ceremony: a guest on a
 * lift's worth of signal taps "Buyurtma berish" twice, and without the key the
 * kitchen cooks two dinners and somebody pays for both. One key per placement,
 * minted here.
 *
 * **The restaurant.** A consumer app has no tenant in its URL — it opens
 * `/customer`, not `/r/{slug}/customer` — so the build names one and this turns
 * it into `X-Tenant`, exactly as `customer-server.ts` does for the menu.
 *
 * **The 419.** A request from the browser straight to Laravel is treated as
 * stateful by `SANCTUM_STATEFUL_DOMAINS` and refused for want of a CSRF token.
 * From Node there is no Origin and no cookie.
 *
 * ---------------------------------------------------------------------------
 * The token rides along when there is one, and is never required
 *
 * Ordering dinner works signed out — that is the whole point of this endpoint,
 * and the API keeps it that way. A guest who IS signed in gets three things a
 * stranger does not: their personal loyalty coupons are visible to the promo
 * check the server re-runs, a per-customer campaign limit can be counted
 * against them, and the bill lands on their own order history rather than
 * beside it. All three need the cookie, so it is forwarded when present.
 */

/**
 * One key per attempt, and only one.
 *
 * Minted here rather than accepted from the client, because a client that
 * chooses its own key can reuse one — and a REUSED key on a changed basket is
 * refused as a conflict, which reads to a guest as "your order failed" when it
 * was in fact refused for being different. The retry story lives one layer up:
 * a screen that wants a resend to land once sends the same request and gets a
 * second key, which is the correct behaviour for a person who pressed twice
 * deliberately after seeing an error.
 */
export async function POST(request: NextRequest) {
  const tenant = await guestTenant();

  if (tenant === null) {
    return NextResponse.json({ error: 'unknown_restaurant' }, { status: 404 });
  }

  const token = await customerToken();

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/public/orders`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Tenant': tenant,
        'X-Locale': localeOf(request),
        'Idempotency-Key': crypto.randomUUID(),
        ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  const payload = (await upstream.json().catch(() => null)) as {
    data?: unknown;
    error?: {
      code?: string;
      message_uz?: string;
      message_ru?: string;
      message_en?: string;
      errors?: Record<string, string[]>;
    };
  } | null;

  if (!upstream.ok) {
    /*
     * The API's own sentence, in the reader's language.
     *
     * "Manti hozir mavjud emas", "this venue is not taking orders" and "the
     * basket is below the minimum" are three different things to do next, and
     * the catalogue already tells them apart in three languages. Flattening
     * them to "order failed" leaves somebody pressing the same button.
     */
    const error = payload?.error;
    const locale = localeOf(request);
    const firstField = Object.values(error?.errors ?? {})[0]?.[0];

    return NextResponse.json(
      {
        error: error?.code ?? 'rejected',
        message:
          firstField ??
          (locale === 'ru' ? error?.message_ru : locale === 'en' ? error?.message_en : undefined) ??
          error?.message_uz,
        /*
         * What the refusal came WITH, when it came with anything.
         *
         * `order.outside_hours` carries the venue's own `opens` and `closes`
         * so the sitting chooser can redraw itself around them instead of
         * offering the same closed hour again; `order.branch_unavailable`
         * carries how many venues there are. `ApiError::toArray()` ends with
         * `[...$body, ...$meta]`, so those ride BESIDE `code` rather than under
         * a `meta` object — and collapsing the envelope to a code and a
         * sentence, as this did, threw every one of them away.
         *
         * Lifted rather than passed straight through: the four envelope keys
         * are already represented above, and re-sending them would give a
         * client two places to read the same sentence from.
         */
        meta: metaOf(error),
      },
      { status: upstream.status },
    );
  }

  return NextResponse.json(payload ?? {}, { status: upstream.status });
}

/**
 * Everything on the refusal that is not the envelope itself.
 *
 * Null rather than an empty object when there is nothing, so a caller can write
 * `if (meta === null)` instead of counting keys.
 */
function metaOf(error: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (error === undefined) return null;

  const envelope = new Set([
    'code',
    'message_uz',
    'message_ru',
    'message_en',
    'field',
    'retryable',
    'errors',
  ]);
  const extra = Object.entries(error).filter(([key]) => !envelope.has(key));

  return extra.length === 0 ? null : Object.fromEntries(extra);
}

function localeOf(request: NextRequest): 'uz' | 'ru' | 'en' {
  const asked = request.nextUrl.searchParams.get('lang');

  return asked === 'ru' || asked === 'en' ? asked : 'uz';
}
