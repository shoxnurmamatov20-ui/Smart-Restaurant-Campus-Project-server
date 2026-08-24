import { NextResponse, type NextRequest } from 'next/server';

import { MP_SESSION_COOKIE, MP_SESSION_MAX_AGE } from '@/lib/mp-cookie';
import { apiBase, SESSION_COOKIE_SECURE } from '@/lib/server-session';

/**
 * Signing into the marketplace, through Node rather than from the browser.
 *
 * The same shape `/api/auth/session` uses for the console, and it exists for
 * the same two reasons.
 *
 * **The token must not reach JavaScript.** A marketplace token is ninety days
 * of somebody's address book, order history and loyalty balance; kept in
 * `localStorage` it is one XSS away from being read, and there is no revocation
 * story that helps afterwards. It goes into an httpOnly cookie the page cannot
 * see, and every read that needs it goes back through the server.
 *
 * **A browser cannot call Laravel directly here.** `SANCTUM_STATEFUL_DOMAINS`
 * makes a request carrying an Origin and cookies count as a session request,
 * which then demands a CSRF token and answers 419. A request from Node has
 * neither, so it is an ordinary token request.
 *
 * POST asks for a code; PUT exchanges one for a session. Two verbs on one route
 * rather than two routes, because they are one conversation and the second is
 * meaningless without the first.
 */

type ApiErrorBody = {
  error?: { code?: string; message_uz?: string; message_ru?: string; message_en?: string };
};

/** Never more than this from a client body — a phone number and a code. */
const MAX_FIELD = 64;

function field(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_FIELD ? value : null;
}

/** POST — send a code to this number. */
export async function POST(request: NextRequest) {
  let body: { phone?: unknown; locale?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const phone = field(body.phone);

  if (phone === null) return NextResponse.json({ error: 'invalid_phone' }, { status: 422 });

  return relay('/mp/auth/otp', { phone, locale: field(body.locale) ?? 'uz' });
}

/** PUT — the code, for a session. */
export async function PUT(request: NextRequest) {
  let body: { phone?: unknown; code?: unknown; name?: unknown; locale?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const phone = field(body.phone);
  const code = field(body.code);

  if (phone === null || code === null) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 422 });
  }

  const upstream = await call('/mp/auth/otp/verify', {
    phone,
    code,
    name: field(body.name),
    locale: field(body.locale) ?? 'uz',
    device_name: 'mypos-web',
  });

  if (upstream === null) {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  const payload = (await upstream.json().catch(() => null)) as
    (ApiErrorBody & { token?: string; data?: unknown }) | null;

  if (!upstream.ok || typeof payload?.token !== 'string') {
    return NextResponse.json(
      { error: payload?.error?.code ?? 'sign_in_failed', message: payload?.error },
      { status: upstream.status === 0 ? 502 : upstream.status },
    );
  }

  /*
   * The profile goes back to the page and the token does not. That asymmetry is
   * the whole point of this handler: the screen needs a name and a points
   * balance to render, and it never needs the credential that fetched them.
   */
  const response = NextResponse.json({ data: payload.data ?? null });

  response.cookies.set(MP_SESSION_COOKIE, payload.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: SESSION_COOKIE_SECURE,
    path: '/',
    maxAge: MP_SESSION_MAX_AGE,
  });

  return response;
}

/**
 * DELETE — sign out.
 *
 * Local only, and that is honest rather than lazy: there is no endpoint that
 * revokes a marketplace token yet, so this drops the cookie and the token
 * expires on its own schedule. On a shared computer the difference matters, so
 * it is written here rather than left to be discovered.
 */
export async function DELETE() {
  const response = NextResponse.json({ data: null });

  response.cookies.set(MP_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: SESSION_COOKIE_SECURE,
    path: '/',
    maxAge: 0,
  });

  return response;
}

async function call(path: string, body: Record<string, unknown>): Promise<Response | null> {
  try {
    return await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return null;
  }
}

/** Pass an answer straight through, keeping its status and its error envelope. */
async function relay(path: string, body: Record<string, unknown>) {
  const upstream = await call(path, body);

  if (upstream === null) {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  const payload = (await upstream.json().catch(() => null)) as unknown;

  return NextResponse.json(payload ?? { error: 'invalid_response' }, { status: upstream.status });
}
