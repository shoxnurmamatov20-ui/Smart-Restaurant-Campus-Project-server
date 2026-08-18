/**
 * The token, held where the browser cannot read it.
 *
 * Signing in used to happen in the browser: the panel called Laravel directly,
 * got a token back and kept it in JavaScript. Two things were wrong with that.
 * A token in JavaScript is a token any injected script can read, and — the one
 * that actually broke — every console screen renders on the server, and a
 * server component cannot see a variable in the browser. So the person was
 * signed in and the console had no idea who they were.
 *
 * Now the browser posts credentials to this app's own route handler, that
 * handler talks to Laravel from Node, and the token comes back in an httpOnly
 * cookie. Nothing in the page can read it; every server render can.
 *
 * It also removes a whole class of problem: a request from Node carries no
 * Origin and no cookies, so Sanctum treats it as the token request it is rather
 * than as a stateful SPA call needing CSRF. The browser→Laravel path needed a
 * `/sanctum/csrf-cookie` round trip first and returned 419 without it.
 *
 * Server-only by convention rather than by the `server-only` package, which is
 * not a dependency of this app: nothing in a client component imports this
 * module, and the cookie *name* is all a client would ever need — it cannot
 * read the value regardless.
 */
export const SESSION_COOKIE = 'restaurant-campus-session';

/**
 * Whether the session cookie is marked `Secure`.
 *
 * `NODE_ENV === 'production'` is the right default and stays the default: a
 * deployment that terminates TLS should never hand the token to a plain-http
 * request. But the two are not the same question, and on a host that serves
 * over http — an IP with no certificate, a box behind someone else's TLS — the
 * default is silently fatal. The browser drops a `Secure` cookie on an http
 * origin without a word, so signing in answers 200, sets nothing, and returns
 * the reader to the login form. Nothing in the logs says why.
 *
 * So the deployment states it. `SESSION_COOKIE_SECURE=false` is an admission
 * that the token crosses the network in clear text and anyone on the path can
 * read it; it belongs to a demo or an internal network, not to a real venue's
 * takings. The fix is a domain and a certificate, not this variable.
 */
export const SESSION_COOKIE_SECURE: boolean =
  process.env.SESSION_COOKIE_SECURE === 'false'
    ? false
    : process.env.SESSION_COOKIE_SECURE === 'true'
      ? true
      : process.env.NODE_ENV === 'production';

/** Where the API lives, from the server's point of view. */
export function apiBase(): string {
  return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';
}

/**
 * How long a console session lasts.
 *
 * Eight hours: a shift, plus the handover at the end of it. Long enough that a
 * manager is not signed out mid-service, short enough that a terminal left on
 * the pass overnight is not still signed in at breakfast. The design caps the
 * platform operator at 30 minutes; that is a different door and belongs with
 * the endpoint that opens it.
 */
export const SESSION_MAX_AGE = 60 * 60 * 8;

/**
 * What `GET /api/v1/auth/context` answers, narrowed to what the console reads.
 *
 * The endpoint sends the whole user resource; the shell needs the name, the
 * roles, and whether the person is pinned to a branch. Typing only that keeps
 * this module free of the API's user shape — the server stays the single
 * authority on what a user is, and a field the console never reads cannot
 * drift out of date here.
 */
export type AuthContext = {
  user: { name: string };
  tenant: { id: number; name: string; slug: string; locale: string; timezone: string };
  branch: { id: number; name: string } | null;
  branch_pinned: boolean;
  roles: string[];
  permissions: string[];
};

/**
 * Ask the API who this token belongs to.
 *
 * `null` for anything other than a clean answer — an expired token, an API that
 * is down, a network that is not there. The caller treats that as "no session"
 * and falls back, because a console that throws a 500 because the API is
 * restarting is worse than one that shows the demo it showed a minute ago.
 */
export async function fetchContextWithToken(token: string): Promise<AuthContext | null> {
  try {
    const response = await fetch(`${apiBase()}/auth/context`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      // A session is per request and per person. Caching it would hand one
      // person's restaurant to the next request that happens to look alike.
      cache: 'no-store',
    });

    if (!response.ok) return null;

    return (await response.json()) as AuthContext;
  } catch {
    return null;
  }
}
