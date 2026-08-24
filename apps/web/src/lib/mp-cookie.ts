/**
 * The marketplace customer's cookie, in a module the edge runtime can read.
 *
 * One name, on its own, for the same reason `crew-cookie.ts` exists:
 * `middleware.ts` runs on the edge where `next/headers` does not, so a name
 * declared beside `cookies()` cannot be imported there. Everything that needs
 * the string imports it from here.
 *
 * ---------------------------------------------------------------------------
 * Why it is a seventh cookie and not one of the six
 *
 * The platform already keeps six credentials apart on purpose — the console
 * session, the till's device and shift, the staff phone's device, tenant and
 * session — and the rule behind all of them is that two different questions
 * never share an answer. This is a seventh question: **who is buying**, on a
 * surface that belongs to no restaurant at all.
 *
 * It cannot be `restaurant-campus-session`. That cookie is a member of staff
 * with a tenant and a role, read by `middleware.ts` to decide which console
 * screens open; a marketplace customer has none of those and must never be
 * mistaken for one. Nor can it be the customer app's, because that guest is a
 * `crm.customers` row belonging to ONE restaurant while this one belongs to
 * the platform — the same person ordering from the same phone is deliberately
 * two different accounts.
 *
 * A year is wrong here and a shift is wrong too. Ninety days matches the
 * token's own expiry (`auth.otp.token_days`), so the cookie and the credential
 * inside it die together — a cookie that outlives its token is a customer
 * being told to sign in again by an API rather than by the app.
 */

/** The consumer's Sanctum token. httpOnly: the browser never reads it. */
export const MP_SESSION_COOKIE = 'restaurant-campus-mp';

/**
 * Ninety days, matching `config('auth.otp.token_days')` on the API.
 *
 * If that is changed there, change it here: the browser forgetting first is a
 * needless sign-in, and the browser forgetting last is a request that 401s for
 * a reason the screen cannot explain.
 */
export const MP_SESSION_MAX_AGE = 60 * 60 * 24 * 90;
