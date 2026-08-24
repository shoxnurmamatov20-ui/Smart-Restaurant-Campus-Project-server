/**
 * The staff app's three cookie names, in a module the edge runtime can read.
 *
 * They lived in `(staff)/crew-session.ts`, which imports `next/headers` — and
 * `middleware.ts` runs on the edge runtime where that module does not exist.
 * Importing the name from there would have pulled `cookies()` into the
 * middleware bundle and failed the build, so the names moved here and
 * `crew-session.ts` re-exports them: one declaration, two runtimes.
 *
 * The split is the same one the till uses and for the same reason: the device
 * says WHICH phone and lasts a year, the session says WHO is holding it and
 * lasts a shift. Merged into one, signing out at the end of a turn would
 * un-enrol the handset and somebody would have to find a manager to read a code
 * out before the next one — which is how people stop signing out.
 */

/** The device token from enrolment. httpOnly, and the phone's whole identity. */
export const CREW_DEVICE_COOKIE = 'restaurant-campus-crew-device';

/** Which restaurant that device belongs to. Sent upstream as `X-Tenant`. */
export const CREW_TENANT_COOKIE = 'restaurant-campus-crew-tenant';

/** The signed-in person's token. Replaced at every handover. */
export const CREW_SESSION_COOKIE = 'restaurant-campus-crew-session';
