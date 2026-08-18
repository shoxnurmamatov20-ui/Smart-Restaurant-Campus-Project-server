/**
 * The till's own credential, held where the room cannot read it.
 *
 * A device token is not a person's session and the two must not share a cookie.
 * A console session belongs to whoever signed in and dies at the end of their
 * shift; a device token belongs to the tablet, survives every shift change, and
 * is the thing a manager revokes when a tablet is lost. Putting both in
 * `restaurant-campus-session` would mean signing a waiter out unpaired the till.
 *
 * httpOnly for a sharper reason than the console's. This tablet stands in a
 * dining room, face up, unattended, all day. A token any script on the page can
 * read is a token that leaves on the first injected script — and unlike a
 * personal session it does not expire at the end of a shift, it authorises
 * every till operation in the venue.
 *
 * The tenant slug rides alongside because the API needs it: a device token
 * names a terminal, and ResolveTenant cannot infer a restaurant from a terminal
 * the way it can from a user. The pairing response hands it over for exactly
 * that reason.
 *
 * Server-only by convention, like lib/server-session.ts — nothing in a client
 * component imports this, and the cookie names are all a client could use
 * anyway, since it cannot read the values.
 */
import { cookies } from 'next/headers';

import { apiBase, SESSION_COOKIE_SECURE } from './server-session';

/** The device token from pairing. httpOnly. */
export const POS_TOKEN_COOKIE = 'restaurant-campus-terminal';

/** The restaurant the paired terminal belongs to. Sent as X-Tenant. */
export const POS_TENANT_COOKIE = 'restaurant-campus-terminal-tenant';

/**
 * A year.
 *
 * A device token is not a session and has no business expiring overnight: a
 * till that had to be re-paired every morning would be re-paired by whoever
 * opened up, using a code read aloud across a room, every single day — which
 * is a worse security story than a long-lived token nobody can read. Revocation
 * is the control that matters here, and it is immediate: re-pairing the
 * terminal or switching it off in the back office kills the token at once.
 */
export const POS_TOKEN_MAX_AGE = 60 * 60 * 24 * 365;

/** Cookie attributes shared by both, so the pair cannot drift apart. */
export const posCookieOptions = {
  sameSite: 'lax' as const,
  secure: SESSION_COOKIE_SECURE,
  path: '/',
  maxAge: POS_TOKEN_MAX_AGE,
};

/** What the terminal is, once it has paired. */
export type PairedTerminal = {
  token: string;
  tenantSlug: string;
};

/** The paired terminal, or null if this tablet has never been paired. */
export async function pairedTerminal(): Promise<PairedTerminal | null> {
  const store = await cookies();
  const token = store.get(POS_TOKEN_COOKIE)?.value;
  const tenantSlug = store.get(POS_TENANT_COOKIE)?.value;

  // Both or neither. One without the other is a half-written pairing, and
  // asking the API with a token but no restaurant is a guaranteed refusal.
  if (token === undefined || tenantSlug === undefined) return null;

  return { token, tenantSlug };
}

/**
 * The shift session token — who is standing at the till right now.
 *
 * The third credential on this tablet and deliberately not merged with either
 * of the others. The device token says WHICH till and lasts a year; this says
 * WHO and lasts one person's turn at it. A waiter handing over to a cashier
 * replaces this and touches neither the pairing nor anybody's password, which
 * is the whole reason a shift change takes one second.
 *
 * Short-lived on purpose: the API closes an idle session after fifteen minutes
 * (pos.pin.session_idle_minutes), and a cookie that outlived it would send a
 * dead token and get a refusal the screen would have to explain. Twelve hours
 * covers the longest realistic turn; the server is what actually decides.
 */
export const POS_SHIFT_COOKIE = 'restaurant-campus-shift';

export const POS_SHIFT_MAX_AGE = 60 * 60 * 12;

/** Who the till believes is standing at it, or null if nobody has signed in. */
export async function shiftToken(): Promise<string | null> {
  const store = await cookies();

  return store.get(POS_SHIFT_COOKIE)?.value ?? null;
}

/** One person the till will let sign in, as GET /v1/pos/auth/staff answers. */
export type PosStaff = {
  user_id: number;
  name: string;
  roles: string[];
  is_locked: boolean;
};

/** What the idle screen needs, exactly as GET /v1/pos/idle answers it. */
export type IdleScreen = {
  terminal: { code: string; name: string; mode: string; app_version: string | null };
  restaurant: { name: string | null; slug: string | null };
  branch: { name: string; city: string | null; address: string | null } | null;
  stats: {
    occupied_tables: number;
    free_tables: number;
    on_shift: number;
    takings_tiyin: number;
  };
  business_date: string;
  server_time: string;
};

/** How long the idle screen waits before drawing what it last knew. */
const TIMEOUT_MS = 4_000;

/**
 * Read the idle screen for the terminal this tablet is paired as.
 *
 * `null` means "not right now" and never means "nothing is happening": no
 * pairing, an API mid-restart, a network that dropped. The screen keeps
 * showing the clock and says the link is down, because a till at the door
 * going blank looks broken to a guest, and a till showing zeros looks like a
 * dead restaurant to the staff.
 */
export async function fetchIdleScreen(): Promise<IdleScreen | null> {
  const terminal = await pairedTerminal();

  if (terminal === null) return null;

  try {
    const response = await fetch(`${apiBase()}/pos/idle`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${terminal.token}`,
        'X-Tenant': terminal.tenantSlug,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return null;

    return (await response.json()) as IdleScreen;
  } catch {
    return null;
  }
}
