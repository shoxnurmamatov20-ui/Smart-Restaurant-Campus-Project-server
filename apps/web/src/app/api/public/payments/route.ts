import { NextResponse, type NextRequest } from 'next/server';

import { guestTenant } from '@/lib/api-server';
import { apiBase } from '@/lib/server-session';

/**
 * Opening an online payment, forwarded from Node.
 *
 * The guest's second write, and it goes the same way the first one does — see
 * `app/api/public/orders/route.ts`, whose three reasons all apply here:
 *
 * **The key.** `POST /api/v1/public/payments/invoice` sits in the `tenant`
 * middleware group and requires an `Idempotency-Key`. A guest on a lift's worth
 * of signal taps "pay" twice, and without it they get two Payme invoices
 * against one bill — of which the bank may perform both.
 *
 * **The restaurant.** The consumer app has no tenant in its URL, so the build
 * names one and this turns it into `X-Tenant`.
 *
 * **The 419.** A browser talking to Laravel directly is stateful under
 * `SANCTUM_STATEFUL_DOMAINS` and is refused for want of a CSRF token. From Node
 * there is no Origin and no cookie.
 *
 * ---------------------------------------------------------------------------
 * What is deliberately NOT forwarded: the amount
 *
 * The API reads it off the bill and would ignore one sent from here, but the
 * body is built here rather than passed through for a stronger reason — a
 * proxy that forwarded whatever it was handed would let a page send an amount
 * the day somebody added the field, and nothing in between would notice.
 */
export async function POST(request: NextRequest) {
  const tenant = await guestTenant();

  if (tenant === null) {
    return NextResponse.json({ error: 'unknown_restaurant' }, { status: 404 });
  }

  let body: {
    order_id?: unknown;
    order_number?: unknown;
    provider?: unknown;
    return_url?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (
    typeof body.order_id !== 'number' ||
    typeof body.order_number !== 'string' ||
    typeof body.provider !== 'string'
  ) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/public/payments/invoice`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Tenant': tenant,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        order_id: body.order_id,
        order_number: body.order_number,
        provider: body.provider,
        ...(typeof body.return_url === 'string' ? { return_url: body.return_url } : {}),
      }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  const payload: unknown = await upstream.json().catch(() => null);

  /*
   * The API's own body goes back untouched, refusals included.
   *
   * Its error envelope carries three languages and a stable code
   * (`finance.payment_order_settled`, `finance.payment_provider_unavailable`),
   * and the screen shows the sentence in the reader's own language. Replacing
   * it with `{error: 'rejected'}` here would throw away the only part of the
   * response a guest can act on.
   */
  return NextResponse.json(payload ?? {}, { status: upstream.status });
}
