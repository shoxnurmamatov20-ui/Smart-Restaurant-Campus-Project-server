import { NextResponse, type NextRequest } from 'next/server';

import { apiBase, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/server-session';

/**
 * The platform door, from this console's own origin.
 *
 * Forwards email, password and the six-digit code to
 * `POST /api/v1/admin/login`, which checks all three and that the account holds
 * `super-admin` and belongs to no restaurant. The token comes back in an
 * httpOnly cookie — see lib/server-session.ts for why the hop through Node is
 * the point rather than an extra step.
 *
 * The API deliberately gives one message for every kind of refusal: saying
 * "wrong code" would confirm the password was right. This handler passes that
 * through rather than trying to be more helpful than the endpoint intends.
 */
export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown; code?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const code = typeof body.code === 'string' ? body.code : '';

  if (email === '' || password === '' || code.length !== 6) {
    return NextResponse.json({ error: 'missing_credentials' }, { status: 422 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password, code, device_name: 'platform-console' }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: 'rejected' }, { status: 401 });
  }

  const data = (await upstream.json()) as { token: string };
  const response = NextResponse.json({ redirect: '/dashboard' });

  response.cookies.set(SESSION_COOKIE, data.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // Matched to the token's own expiry so the cookie never outlives what it
    // carries. A cookie that survives its token buys a 401, not a session.
    maxAge: SESSION_MAX_AGE,
  });

  return response;
}

/** Sign out: revoke upstream, clear locally whether or not that worked. */
export async function DELETE(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token) {
    try {
      await fetch(`${apiBase()}/auth/logout`, {
        method: 'POST',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
    } catch {
      // A token the server still honours and nobody holds is a nuisance; a
      // browser that stays signed in because logout failed is a breach.
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);

  return response;
}
