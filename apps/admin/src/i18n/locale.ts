/**
 * Where the platform console keeps the reader's language.
 *
 * A cookie rather than a URL segment: this console has one deployment and its
 * routes are the destinations in the rail, so prefixing every one of them with
 * a locale would change the URL surface for a preference. A cookie also
 * survives a full reload, which a `useState` would not, and — the reason it is
 * a cookie and not localStorage — the server can read it, so a server-rendered
 * page comes back in the right language rather than flashing Uzbek first.
 *
 * Kept apart from ./config.ts on purpose: that module calls `next/headers`, and
 * a client component importing this constant from it would drag the server-only
 * API into the browser bundle.
 *
 * The name differs from the web app's so an operator reading the console in
 * English does not thereby switch a restaurant's own screens.
 */
export const LOCALE_COOKIE = 'restaurant-campus-admin-locale';

/** A year. The choice is a preference, not a session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Write the choice down, from the browser.
 *
 * `SameSite=Lax` because nothing cross-site should be able to set someone's
 * language, and no `Secure` flag so it still works over plain http in
 * development; production terminates TLS at the edge and the cookie carries
 * nothing worth protecting either way.
 *
 * A function rather than an inline assignment at the call site so the React
 * compiler sees a call, not a write to something it cannot reason about.
 */
export function rememberLocale(locale: string): void {
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=${LOCALE_COOKIE_MAX_AGE};samesite=lax`;
}
