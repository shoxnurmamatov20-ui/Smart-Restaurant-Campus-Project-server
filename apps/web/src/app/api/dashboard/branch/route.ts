import { NextResponse, type NextRequest } from 'next/server';

import { forwardRead, jsonBody } from '@/lib/api-proxy';
import { BRANCH_COOKIE, BRANCH_COOKIE_MAX_AGE } from '@/lib/branch-cookie';
import { SESSION_COOKIE_SECURE } from '@/lib/server-session';

/**
 * Choosing which venue the console is reading.
 *
 * The top bar's branch switcher, finally doing something. It used to be a
 * dropdown that set React state and flashed "switched to Yunusobod", after
 * which every figure on the page stayed whatever it had been — an owner
 * reading one venue's takings under another venue's name, on every screen.
 *
 * ---------------------------------------------------------------------------
 * Why the browser is not allowed to write this cookie itself
 *
 * The language and the role are written with `document.cookie`, and they can
 * be: the worst a bad value does there is draw the wrong sidebar. This one
 * becomes the `X-Branch` header on EVERY request the console makes, and the
 * API answers a slug it does not recognise with `branch.not_found` — 404, on
 * every screen at once, from a cookie the reader cannot see and did not know
 * they had. So the value is checked against the restaurant's own register here,
 * where the session token is, and written by the server or not at all.
 *
 * ---------------------------------------------------------------------------
 * A pinned reader has no choice to make
 *
 * `ResolveBranch` refuses another venue outright to somebody whose user row
 * carries a `branch_id` — `branch.mismatch`, a 403. Writing the cookie for
 * them would be handing them a console where every read is refused once and
 * retried, which is twice the requests to reach the same page they would have
 * seen anyway. They are told 409 instead, and the switcher is not drawn for
 * them in the first place.
 *
 * ---------------------------------------------------------------------------
 * `null` is the roll-up, not a mistake
 *
 * Clearing the cookie is how "Barcha filiallar" is chosen, and that is exactly
 * what an absent `X-Branch` means to the API. The two states are the product's,
 * not an accident of storage.
 */
type Body = { slug?: unknown };

/** What `GET /api/v1/branches` answers, narrowed to what has to be checked. */
type Register = { data?: { slug?: unknown; status?: unknown }[] };

/** What `GET /api/v1/auth/context` answers, narrowed to the one flag. */
type Context = { branch_pinned?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const wanted = typeof body.slug === 'string' ? body.slug.trim() : null;

  const context = await forwardRead<Context>(request, '/auth/context');

  // No answer at all is no session, or an API that is not there. Either way
  // this cannot be verified, and a handler that cannot verify must refuse.
  if (context === null) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  if (context.branch_pinned === true) {
    return NextResponse.json({ error: 'branch_pinned' }, { status: 409 });
  }

  const options = {
    sameSite: 'lax' as const,
    // Same reasoning as the session cookie: a deployment that does not
    // terminate TLS has to say so out loud. See lib/server-session.ts.
    secure: SESSION_COOKIE_SECURE,
    path: '/',
  };

  if (wanted === null || wanted === '') {
    const cleared = NextResponse.json({ slug: null });
    cleared.cookies.delete(BRANCH_COOKIE);

    return cleared;
  }

  const register = await forwardRead<Register>(request, '/branches?per_page=100');

  const known = (register?.data ?? []).some(
    (branch) => typeof branch.slug === 'string' && branch.slug === wanted,
  );

  /*
   * Refused rather than stored optimistically.
   *
   * The register is tenant-scoped by the token, so "not in this list" means
   * "not this restaurant's" — which is the case that would otherwise put a
   * stranger's slug on every request in the console.
   */
  if (!known) {
    return NextResponse.json({ error: 'unknown_branch' }, { status: 404 });
  }

  const response = NextResponse.json({ slug: wanted });

  /*
   * httpOnly, unlike the role cookie beside it.
   *
   * Not because the value is a secret — a venue's slug is printed on the
   * switcher — but because nothing in the browser has any reason to read or
   * write it, and the one thing a script could do with it is set a slug that
   * was never checked. Every reader of this cookie is on the server.
   */
  response.cookies.set(BRANCH_COOKIE, wanted, {
    ...options,
    httpOnly: true,
    maxAge: BRANCH_COOKIE_MAX_AGE,
  });

  return response;
}
