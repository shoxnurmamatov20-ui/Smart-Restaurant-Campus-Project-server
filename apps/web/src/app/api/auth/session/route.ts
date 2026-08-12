import { NextResponse, type NextRequest } from 'next/server';

import { apiBase, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/server-session';
import { ROLE_COOKIE } from '@/lib/role-cookie';
import { landingPath, roleFromServer } from '@/lib/roles';

/**
 * Signing in and out, from this app's own origin.
 *
 * The browser posts credentials here; this handler talks to Laravel from Node
 * and puts the token in an httpOnly cookie. See lib/server-session.ts for why
 * that indirection is the point rather than an extra hop — in short, a server
 * component cannot read a token the browser is holding, and a browser→Laravel
 * call from a stateful origin needs a CSRF round trip that a Node call does not.
 *
 * The password never touches this app's storage: it arrives, it is forwarded,
 * it is forgotten. Nothing here logs the body.
 */

/** The shape Laravel answers `POST /api/v1/auth/login` with. */
type LoginResponse = {
  token: string;
  user: { name: string; roles: string[] };
};

export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (email === '' || password === '') {
    return NextResponse.json({ error: 'missing_credentials' }, { status: 422 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password, device_name: 'console' }),
      cache: 'no-store',
    });
  } catch {
    // The API is down or unreachable. Distinguished from a refusal because the
    // two need different words in front of a person: one is "try again", the
    // other is "that password is wrong".
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  if (!upstream.ok) {
    const detail = (await upstream.json().catch(() => null)) as { message?: string } | null;

    return NextResponse.json(
      { error: 'rejected', message: detail?.message },
      { status: upstream.status === 422 ? 422 : 401 },
    );
  }

  const data = (await upstream.json()) as LoginResponse;
  const role = roleFromServer(data.user.roles ?? []);

  if (role === null) {
    // A real account the design has drawn no console for — a bartender, a
    // courier. No cookie is set: there is nowhere for them to land, and a
    // session that lands nowhere is worse than none.
    return NextResponse.json({ error: 'no_surface' }, { status: 403 });
  }

  const response = NextResponse.json({ role: role.id, redirect: landingPath(role) });

  const options = {
    sameSite: 'lax' as const,
    // Off over plain http so development works; production terminates TLS and
    // sets NODE_ENV, which is the condition that matters.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  };

  response.cookies.set(SESSION_COOKIE, data.token, { ...options, httpOnly: true });

  /*
   * The role, alongside the token, for the route guard.
   *
   * middleware.ts runs before every navigation and must answer "may this
   * person open /finance" without a network call — a round trip to Laravel on
   * every click is not a guard, it is a tax. So the role is written here where
   * it is already known.
   *
   * Missing this is how the guard silently stopped guarding: with a real
   * session and no role cookie, `roleOrDefault(undefined)` returned the owner
   * and a waiter could open every screen. Caught by asking a signed-in waiter
   * for /finance and getting 200.
   *
   * Not httpOnly, and it does not need to be: it decides which rows to draw,
   * never what a request may touch. Forging it changes the picture and nothing
   * else — the API still answers to the token, which cannot be forged here.
   */
  response.cookies.set(ROLE_COOKIE, role.id, { ...options, httpOnly: false });

  return response;
}

/**
 * Sign out.
 *
 * Revokes the token upstream, then clears the cookie either way. A failure to
 * reach the API must not leave a signed-in browser: the local cookie goes
 * regardless, and the worst case is a token the server still honours that
 * nobody holds.
 */
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
      // Deliberately ignored — see the note above.
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  // Both, or the next visitor inherits the last person's sidebar.
  response.cookies.delete(ROLE_COOKIE);

  return response;
}
