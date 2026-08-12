/**
 * The platform operator's session, held where the browser cannot read it.
 *
 * The same shape as the staff console's (apps/web/src/lib/server-session.ts)
 * and for the same reasons: a token in JavaScript is a token any injected
 * script can read, and every screen here renders on the server, which cannot
 * see a variable in the browser.
 *
 * One difference, and it is the design's (§3.12): this session lasts thirty
 * minutes, not a shift. `POST /api/v1/admin/login` issues a token that expires
 * on the server at the same mark, so a cookie that outlived it would only buy
 * a 401 — both are set from the same number for that reason.
 *
 * Server-only by convention: nothing in a client component imports this.
 */
export const SESSION_COOKIE = 'restaurant-campus-admin-session';

/** Thirty minutes, as the design specifies for the platform console. */
export const SESSION_MAX_AGE = 60 * 30;

export function apiBase(): string {
  return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';
}
