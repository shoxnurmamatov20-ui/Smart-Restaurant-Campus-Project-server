import type { AuthContext } from './auth';

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
