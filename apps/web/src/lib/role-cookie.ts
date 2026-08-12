/**
 * Where the console keeps which role is being looked through.
 *
 * A cookie for the same reason the language is one: the shell is a server
 * component, and a role held in `useState` would render the owner's sidebar on
 * the server and then swap it after hydration — the reader would watch nineteen
 * rows collapse to two.
 *
 * **This is a demo affordance, not authorisation.** The design says so
 * outright: role comes from the session in production, and the prototype's
 * switcher is there so a reviewer can look through eight pairs of eyes. Nothing
 * downstream may treat this cookie as proof of anything. The sidebar reads it
 * to decide what to *draw*; every request still carries a Sanctum token and the
 * API decides what to *answer*.
 *
 * Kept apart from ./session.ts because that module calls `next/headers`, and a
 * client component importing this constant from there would pull a server-only
 * API into the browser bundle.
 */
export const ROLE_COOKIE = 'restaurant-campus-role';

/** A day. Long enough to survive a reload, short enough not to be a login. */
export const ROLE_COOKIE_MAX_AGE = 60 * 60 * 24;

/**
 * Whether the role switcher is drawn at all.
 *
 * Off unless a build explicitly asks for it. `NEXT_PUBLIC_*` is inlined at
 * build time, so a production bundle built without it does not merely hide the
 * control — the branch is eliminated and the switcher is not in the file.
 */
export const DEMO_ROLES_ENABLED = process.env.NEXT_PUBLIC_DEMO_ROLES === '1';

/**
 * Write the choice down, from the browser.
 *
 * `SameSite=Lax` so nothing cross-site can pick someone's role for them, and no
 * `Secure` flag so it still works over plain http in development.
 */
export function rememberRole(role: string): void {
  document.cookie = `${ROLE_COOKIE}=${role};path=/;max-age=${ROLE_COOKIE_MAX_AGE};samesite=lax`;
}
