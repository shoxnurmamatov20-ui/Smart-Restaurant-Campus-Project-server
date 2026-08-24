import { cookies } from 'next/headers';

import { CREW_DEVICE_COOKIE, CREW_SESSION_COOKIE, CREW_TENANT_COOKIE } from '@/lib/crew-cookie';

import { SESSION_COOKIE_SECURE } from '@/lib/server-session';

import type { Lang } from '@restaurant/surfaces/crew/data';

/**
 * Which language the staff app opens in.
 *
 * Not `next-intl`: that resolves through a request context this surface never
 * establishes, and it would ship the console's whole catalogue to a phone that
 * only needs the eleven sections in `crew-copy.ts`. The catalogue here is its
 * own file and this is a plain lookup over the browser's own header.
 *
 * In production the person's language comes with the shift session — a waiter
 * who reads Russian should get Russian on a phone the restaurant handed them,
 * whatever the phone's own setting is. Until that endpoint exists the header is
 * the only signal there is, and Uzbek is the fallback because the restaurant is
 * in Uzbekistan and someone who expressed no preference is far likelier to read
 * it than English.
 */
export function crewLang(acceptLanguage: string | null): Lang {
  const first = (acceptLanguage ?? '').split(',')[0]?.slice(0, 2).toLowerCase();

  return first === 'ru' || first === 'en' ? first : 'uz';
}

/* ============================================================
   Two credentials, two cookies

   The same split the till uses and for the same reason: the device says WHICH
   phone and lasts a year, the session says WHO is holding it and lasts a shift.
   Merged into one, signing out at the end of a turn would un-enrol the handset
   and somebody would have to find a manager to read a code out before the next
   one — which is how people stop signing out.
   ============================================================ */

/*
 * The three names live in `@/lib/crew-cookie` and are re-exported here.
 *
 * `middleware.ts` needs the session name to guard the shift screens, and it
 * runs on the edge runtime — where `next/headers`, imported at the top of this
 * file, does not exist. One declaration, two runtimes.
 */
export { CREW_DEVICE_COOKIE, CREW_SESSION_COOKIE, CREW_TENANT_COOKIE } from '@/lib/crew-cookie';

/**
 * A year for the enrolment.
 *
 * A device token is not a session and has no business expiring overnight: a
 * phone that had to be re-enrolled every morning would be re-enrolled by
 * whoever opened up, from a code read aloud, every day — a worse security story
 * than a long-lived token nobody can read. Revocation is the control that
 * matters and it is immediate: issuing a new code or sacking the employee kills
 * the token in the same statement.
 */
export const CREW_DEVICE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Twelve hours for the person.
 *
 * Long enough for the longest realistic turn, short enough that a phone left in
 * a locker overnight is not a signed-in phone in the morning. The server is
 * what actually decides — this only stops the browser sending a token that is
 * certainly dead.
 */
export const CREW_SESSION_MAX_AGE = 60 * 60 * 12;

const shared = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: SESSION_COOKIE_SECURE,
  path: '/',
};

export const crewDeviceCookieOptions = { ...shared, maxAge: CREW_DEVICE_MAX_AGE };

export const crewSessionCookieOptions = { ...shared, maxAge: CREW_SESSION_MAX_AGE };

/** What the phone is, once it has been enrolled. */
export type EnrolledPhone = {
  token: string;
  tenantSlug: string;
};

/**
 * The enrolled phone, read off a request.
 *
 * Both halves or neither. One without the other is a half-written enrolment,
 * and asking the API with a token but no restaurant is a guaranteed refusal —
 * `ResolveTenant` cannot infer a restaurant from a device token, which is
 * exactly why the pairing response hands back a slug to keep.
 */
export function enrolledPhoneFrom(request: {
  cookies: { get(name: string): { value: string } | undefined };
}): EnrolledPhone | null {
  const token = request.cookies.get(CREW_DEVICE_COOKIE)?.value;
  const tenantSlug = request.cookies.get(CREW_TENANT_COOKIE)?.value;

  if (token === undefined || tenantSlug === undefined) return null;

  return { token, tenantSlug };
}

/** The same, from the ambient store, for server components with no request. */
export async function enrolledPhone(): Promise<EnrolledPhone | null> {
  const store = await cookies();
  const token = store.get(CREW_DEVICE_COOKIE)?.value;
  const tenantSlug = store.get(CREW_TENANT_COOKIE)?.value;

  if (token === undefined || tenantSlug === undefined) return null;

  return { token, tenantSlug };
}

/** The signed-in person's token, or null when nobody is. */
export async function crewSessionToken(): Promise<string | null> {
  return (await cookies()).get(CREW_SESSION_COOKIE)?.value ?? null;
}
