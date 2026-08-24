import { NextResponse, type NextRequest } from 'next/server';

import { badRequest, jsonBody, whole } from '@/lib/api-proxy';
import { ROLE_COOKIE } from '@/lib/role-cookie';
import { landingPath, roleFromServer, ROLES } from '@/lib/roles';
import {
  apiBase,
  fetchContextWithToken,
  SESSION_COOKIE,
  SESSION_COOKIE_SECURE,
} from '@/lib/server-session';

/**
 * Taking a seat inside somebody else's restaurant.
 *
 * The most powerful call on the platform, and the only one here that does not
 * go through `forward()`. It cannot: the answer carries a *credential*, and a
 * credential passed back to the browser as JSON is a credential in JavaScript.
 * So the token is read in Node and written straight into the httpOnly cookie,
 * exactly as `api/auth/session` and `api/auth/platform` do — the page never
 * sees it.
 *
 * ---------------------------------------------------------------------------
 * The reason field is the guard
 *
 * Not the route — every route on this surface is already `super-admin`, so the
 * permission system has nothing left to say about it. What stands between an
 * operator and a customer's till is a sentence explaining why, stored NOT NULL
 * beside the session it authorised. `ImpersonateRequest` sets the floor at ten
 * characters and it is repeated here rather than left upstream, because a
 * refusal that arrives after a round trip is a refusal the operator answers by
 * typing "asdfasdfasdf" — the check has to land while the field is still in
 * front of them, next to the sentence saying who will read it.
 *
 * ---------------------------------------------------------------------------
 * It replaces the session rather than adding one
 *
 * The operator's own token leaves the cookie and the restaurant's arrives in
 * its place, so the console downstream is the owner's console with no special
 * case anywhere in it: `middleware.ts` guards the routes an owner may open, the
 * API answers to the owner's token, and `/platform` closes because the role
 * cookie no longer says `super`. Coming back means signing in at the operator
 * door again.
 *
 * The alternative — parking the operator's super-admin token in a second cookie
 * so it can be swapped back — was rejected. It would leave the credential that
 * opens every restaurant on the platform sitting in the browser for the whole
 * of somebody else's session, which is a strictly larger thing to steal than
 * the fifteen-minute token it was traded for.
 *
 * The operator's token is not revoked upstream, only dropped: nobody else is
 * holding a copy, and it expires on its own in at most thirty minutes.
 */
type Body = { tenantId?: unknown; reason?: unknown };

/** `ImpersonateRequest::rules()` — repeated, never guessed. */
const REASON_MIN = 10;
const REASON_MAX = 500;

/** What the API answers with. Narrowed to what this handler acts on. */
type Answer = {
  impersonation?: {
    token?: unknown;
    expires_at?: unknown;
    banner?: unknown;
    as?: { name?: unknown } | null;
  };
};

/**
 * How long the cookie lives, from the expiry the server chose.
 *
 * A minute past the token, deliberately, and the reasoning is
 * `api/auth/platform`'s: a cookie that outlives its token gets a clean 401 on
 * the last request, whereas a cookie that dies first drops the reader at the
 * login form with nothing said. Falls back to sixteen minutes when the answer
 * carries no expiry — one more than `Impersonation::MINUTES`.
 */
function cookieSeconds(expiresAt: unknown): number {
  if (typeof expiresAt !== 'string') return 16 * 60;

  const remaining = Math.round((Date.parse(expiresAt) - Date.now()) / 1000);

  return Number.isFinite(remaining) && remaining > 0 ? remaining + 60 : 16 * 60;
}

export async function POST(request: NextRequest) {
  const operatorToken = request.cookies.get(SESSION_COOKIE)?.value;

  if (operatorToken === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const tenantId = whole(body.tenantId);

  if (tenantId === null) return badRequest('invalid_tenant');

  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    return badRequest('invalid_reason');
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/platform/tenants/${tenantId}/impersonate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${operatorToken}`,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({ reason }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  const payload: unknown = await upstream.json().catch(() => null);

  // The API's own envelope, with its own status and its three sentences. It
  // says things this handler cannot know — impersonation switched off for the
  // whole platform, a restaurant with no active account to sign in as.
  if (!upstream.ok) {
    return NextResponse.json(payload ?? { error: 'rejected' }, { status: upstream.status });
  }

  const answer = (payload ?? {}) as Answer;
  const minted = answer.impersonation;
  const token = typeof minted?.token === 'string' ? minted.token : '';

  if (token === '') {
    // A 201 with no credential in it. Nothing to swap to, and the audit row
    // upstream already records an impersonation that never happened — which is
    // the safe direction for that pair to fail in.
    return NextResponse.json({ error: 'unreadable_answer' }, { status: 502 });
  }

  /*
   * Which console the token opens, asked of the API rather than assumed.
   *
   * The endpoint takes the restaurant's owner when no `user_id` is sent, and
   * this handler never sends one — so `owner` is the honest fallback when the
   * context call itself fails. It is a fallback and not the answer, because the
   * role cookie decides which sidebar is drawn, and a console drawn for the
   * wrong role is a console full of rows that 403 when pressed.
   */
  const context = await fetchContextWithToken(token);
  const role = roleFromServer(context?.roles ?? []) ?? ROLES.owner;

  const response = NextResponse.json({
    redirect: landingPath(role),
    banner: typeof minted?.banner === 'string' ? minted.banner : null,
    expiresAt: typeof minted?.expires_at === 'string' ? minted.expires_at : null,
  });

  const options = {
    sameSite: 'lax' as const,
    secure: SESSION_COOKIE_SECURE,
    path: '/',
    maxAge: cookieSeconds(minted?.expires_at),
  };

  response.cookies.set(SESSION_COOKIE, token, { ...options, httpOnly: true });
  response.cookies.set(ROLE_COOKIE, role.id, { ...options, httpOnly: false });

  return response;
}
