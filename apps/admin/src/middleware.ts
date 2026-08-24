import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE } from '@/lib/server-session';

/**
 * The door this console never had.
 *
 * `POST /api/v1/admin/login` is careful work: email, password and a TOTP code,
 * `super-admin` only, refused for any account that belongs to a restaurant, a
 * token capped at thirty minutes, every refusal answered with the same sentence
 * so a wrong code cannot confirm a right password. The sign-in form in front of
 * it is equally careful. And **nothing enforced either of them** — there was no
 * middleware here, the layout read no session, and `getSession` appeared
 * nowhere in this app. Anything that could reach the port rendered the console
 * that suspends tenants, holds API keys, lists backups and offers to
 * impersonate a user.
 *
 * The damage was bounded only by accident: none of the forty-seven content
 * screens calls the API yet, so what an unauthenticated visitor saw was
 * fixtures. That is not a control, it is a delay — the guard has to exist
 * before the screens are wired, not after.
 *
 * ---------------------------------------------------------------------------
 * What this checks, and what it does not
 *
 * It checks that a session cookie is **present**. It cannot check that the
 * token inside is valid, and it deliberately does not try: verifying would mean
 * a network call to Laravel on every navigation, from an edge runtime, holding
 * the render. The real boundary is the API — every screen that fetches sends
 * this token and gets a 401 if it has expired.
 *
 * So this is the same kind of control as the staff console's `middleware.ts`:
 * it decides what is *drawn*, not what is *permitted*. A cookie with a dead
 * token gets the console and then gets 401s inside it, which is the correct
 * outcome — the operator sees the console they know, with a session that has
 * run out, rather than a blank redirect they cannot explain.
 *
 * The thirty-minute cap does most of the work here anyway: the cookie's own
 * `Max-Age` matches the token's expiry, so a stale cookie stops being sent at
 * roughly the moment it stops being useful.
 */

/** Where an unauthenticated visitor is sent. */
const LOGIN = '/login';

/**
 * What stays open.
 *
 * The login screen itself, the route handler behind it — a visitor with no
 * session must be able to POST credentials — and Next's own asset paths, which
 * `config.matcher` already excludes but which are listed here so the intent
 * survives a matcher edit.
 */
const PUBLIC = ['/login', '/api/auth/session'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const signedIn = request.cookies.has(SESSION_COOKIE);

  if (isPublic) {
    /*
     * An operator who is already signed in has no business on the sign-in
     * screen: the form would take a second set of credentials and mint a
     * second token, quietly ending the session they were using in another tab.
     */
    if (signedIn && pathname === LOGIN) {
      const home = request.nextUrl.clone();

      home.pathname = '/';
      home.search = '';

      return NextResponse.redirect(home);
    }

    return NextResponse.next();
  }

  if (!signedIn) {
    /*
     * `nextUrl.clone()`, not `new URL(LOGIN, request.url)`.
     *
     * This console is mounted under `basePath: '/admin'`. `request.url` is the
     * full incoming address, so resolving `/login` against it produces
     * `https://host/login` — the staff console's sign-in, on a different
     * application, which 404s or worse. `nextUrl` is basePath-aware: its
     * `pathname` is already stripped of the prefix and the prefix is put back
     * when the redirect is written.
     */
    const url = request.nextUrl.clone();

    url.pathname = LOGIN;
    url.search = '';

    /*
     * Carry where they were going, so signing in lands on the screen they
     * asked for rather than the dashboard. `pathname` only — a query string
     * from this console can name a tenant, and putting that in a URL that
     * predates the session writes it into a log nobody has audited.
     */
    if (pathname !== '/') url.searchParams.set('next', pathname);

    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Everything except Next's own plumbing and static files. Written as an
   * exclusion rather than a list of guarded paths on purpose: a new screen
   * added to this console is guarded the moment it exists, and forgetting to
   * add it to an allowlist is exactly the mistake this file is repairing.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
