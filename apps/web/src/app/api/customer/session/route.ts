import { NextResponse, type NextRequest } from 'next/server';

import {
  CUSTOMER_COOKIE,
  CUSTOMER_COOKIE_OPTIONS,
  customerToken,
  forward,
  localeOf,
  refusal,
} from '@/lib/customer-gateway';
import { guestTenant } from '@/lib/api-server';
import { apiBase } from '@/lib/server-session';

/**
 * The guest's session: the code goes in, an httpOnly cookie comes back.
 *
 * `POST` verifies the SMS code and keeps the token here rather than handing it
 * to the page — a customer token is good for ninety days and reaches that
 * person's profile, addresses and history, and a token in JavaScript is a token
 * an injected script can read. `DELETE` signs out on this device only.
 *
 * This handler cannot use the shared `forward()` for the POST, because it has
 * to read the token out of the answer before deciding what to send back. What
 * the browser gets is the profile and nothing else.
 */
export async function POST(request: NextRequest) {
  const tenant = await guestTenant();

  if (tenant === null) {
    return NextResponse.json({ error: 'unknown_restaurant' }, { status: 404 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/public/auth/otp/verify`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Tenant': tenant,
        'X-Locale': localeOf(request),
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  const payload = (await upstream.json().catch(() => null)) as {
    token?: string;
    expires_at?: string;
    data?: unknown;
    error?: { code?: string };
  } | null;

  if (!upstream.ok || typeof payload?.token !== 'string') {
    return NextResponse.json(refusal(payload, localeOf(request)), {
      status: upstream.ok ? 502 : upstream.status,
    });
  }

  // The profile, never the token: the page has no use for it and every reason
  // not to hold it.
  const response = NextResponse.json({ data: payload.data ?? null });
  response.cookies.set(CUSTOMER_COOKIE, payload.token, CUSTOMER_COOKIE_OPTIONS);

  return response;
}

/**
 * Sign out on this device.
 *
 * The cookie goes whatever the API says. A failure to reach it must not leave a
 * browser that still believes it is signed in; the worst case is a token the
 * server still honours that nobody holds — the same trade `app/api/auth/session`
 * makes for the console.
 */
export async function DELETE(request: NextRequest) {
  const token = await customerToken();

  if (token !== undefined) {
    await forward(request, '/public/me/session', { method: 'DELETE', signedIn: true }).catch(
      () => null,
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(CUSTOMER_COOKIE);

  return response;
}

/** Who is signed in on this device, for a client rehydrating after a reload. */
export async function GET(request: NextRequest) {
  return forward(request, '/public/me', { method: 'GET', signedIn: true });
}
