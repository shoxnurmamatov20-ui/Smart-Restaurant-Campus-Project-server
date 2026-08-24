import { NextResponse, type NextRequest } from 'next/server';

import { apiBase, SESSION_COOKIE, SESSION_COOKIE_SECURE } from '@/lib/server-session';
import { ROLE_COOKIE } from '@/lib/role-cookie';

/**
 * The platform operator's door — `POST /api/v1/admin/login`.
 *
 * A sibling of `../session/route.ts` and for the same reason: the browser posts
 * here, this handler talks to Laravel from Node, and the token lands in an
 * httpOnly cookie a server component can read. Calling Laravel from the browser
 * would leave the token in JavaScript and, from a stateful origin, need a CSRF
 * round trip first.
 *
 * Separate from the tenant door rather than a flag on it, because the two are
 * different endpoints with different rules: this one demands a TOTP code, is
 * open only to `super-admin`, refuses any account attached to a restaurant, and
 * issues a token that expires in thirty minutes. Sharing one handler would mean
 * one branch deciding which of those applied, which is exactly the kind of
 * branch that eventually lets a restaurant owner through the operator door.
 *
 * ---------------------------------------------------------------------------
 * The session is thirty minutes and the cookie says so
 *
 * `SESSION_MAX_AGE` is the console's eight hours. Reusing it here would leave a
 * cookie in the browser for eight hours holding a token Laravel stopped
 * honouring after thirty minutes — a signed-in-looking console that 401s on
 * every request. The cookie outlives the token by a minute, deliberately, so
 * the last request before expiry gets a clean refusal rather than a redirect.
 */
const OPERATOR_MAX_AGE = 31 * 60;

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

  if (email === '' || password === '' || code === '') {
    return NextResponse.json({ error: 'missing_credentials' }, { status: 422 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password, code, device_name: 'platform' }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  if (!upstream.ok) {
    const detail = (await upstream.json().catch(() => null)) as { message?: string } | null;

    /*
     * One refusal, whatever was wrong.
     *
     * Wrong password and wrong code are the same answer here. Telling an
     * attacker which half they got right turns a two-factor door into two
     * one-factor doors, and this is the door to every restaurant on the
     * platform. The status is passed through only far enough to separate
     * "refused" from "you sent nonsense".
     */
    return NextResponse.json(
      { error: 'rejected', message: detail?.message },
      { status: upstream.status === 422 ? 422 : 401 },
    );
  }

  const data = (await upstream.json()) as { token?: string };

  if (typeof data.token !== 'string' || data.token === '') {
    return NextResponse.json({ error: 'rejected' }, { status: 401 });
  }

  const response = NextResponse.json({ redirect: '/platform' });

  const options = {
    sameSite: 'lax' as const,
    secure: SESSION_COOKIE_SECURE,
    path: '/',
    maxAge: OPERATOR_MAX_AGE,
  };

  response.cookies.set(SESSION_COOKIE, data.token, { ...options, httpOnly: true });

  /* The route guard reads this to decide what to draw. `super` is the console
     role id for `super-admin` — see lib/roles.ts SERVER_ROLE_NAMES. */
  response.cookies.set(ROLE_COOKIE, 'super', { ...options, httpOnly: false });

  return response;
}
