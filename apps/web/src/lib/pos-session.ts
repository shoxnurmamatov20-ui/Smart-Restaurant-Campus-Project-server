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

import type { ImagePayload } from '@restaurant/surfaces/media/image';

import { FALLBACK_LADDER, ladderFrom, type ApiCashLadder, type CashLadder } from './cash-notes';
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
 * The same, read off a request rather than the ambient store.
 *
 * A route handler has the request in its hand; reaching for `cookies()` is
 * indirection it does not need, and the async store is not available outside a
 * request scope — so a handler written that way cannot be tested without
 * mocking framework internals, which is a test of the mock. Server components
 * have no request object and keep using the store above.
 */
export function pairedTerminalFrom(request: {
  cookies: { get(name: string): { value: string } | undefined };
}): PairedTerminal | null {
  const token = request.cookies.get(POS_TOKEN_COOKIE)?.value;
  const tenantSlug = request.cookies.get(POS_TENANT_COOKIE)?.value;

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

/** One dish, as GET /v1/pos/menu returns it. */
export type PosDish = {
  id: number;
  sku: string;
  title: string;
  description: string | null;
  station: string | null;
  price_tiyin: number;
  is_orderable: boolean;
  /**
   * 86'd in this kitchen tonight.
   *
   * Not the same as `is_orderable`, which is the business's answer — a dish
   * withdrawn from the menu, a draft, one archived. Those never come down at all.
   * This one does, drawn dashed: a waiter shown Manti crossed out knows the answer
   * to "do you have Manti" without walking to the pass, and knows they have not
   * misremembered the menu — which is what a silently missing tile makes them
   * think.
   */
  is_stopped: boolean;
  cook_time_minutes: number | null;
  kind: string;
  /**
   * The photograph at every size the platform keeps, or null — see
   * `@restaurant/surfaces/media/image`. The tile draws `thumb`: 160px for a
   * 44px box, crisp at 3× and five kilobytes rather than the hundred and
   * twenty the full file costs, two hundred times over, every time a waiter
   * opens the board.
   */
  image: ImagePayload | null;
  /** One address, for readers that want one. The tile does not. */
  image_url: string | null;
};

/** A section of the board — a category with dishes under it. */
export type PosSection = {
  id: number;
  slug: string;
  title: string;
  dishes: PosDish[];
};

/** One answer a guest may give, and what it adds. */
export type PosChoice = {
  id: number;
  title: string;
  price_delta_tiyin: number;
};

/** A question about a dish, with the rules for answering it. */
export type PosQuestion = {
  id: number;
  title: string;
  is_multi: boolean;
  min_choices: number;
  max_choices: number;
  choices: PosChoice[];
};

/**
 * The whole sellable board for a channel.
 *
 * Read once when the order screen opens rather than per category: a waiter
 * switching from Salatlar to Ichimliklar mid-order must not wait on a network,
 * and on a tablet in a basement dining room that wait is not hypothetical.
 * The stop list is already folded in by the API — a dish the kitchen pulled is
 * absent rather than present-and-greyed, because the till must not offer it.
 */
export async function fetchPosMenu(channel = 'dine_in'): Promise<PosSection[] | null> {
  const terminal = await pairedTerminal();
  const shift = await shiftToken();

  if (terminal === null || shift === null) return null;

  try {
    const response = await fetch(`${apiBase()}/pos/menu?channel=${encodeURIComponent(channel)}`, {
      headers: {
        Accept: 'application/json',
        // The person's token: reading the board is a permission
        // (`pos.view`), and a device holds none.
        Authorization: `Bearer ${shift}`,
        'X-Tenant': terminal.tenantSlug,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const body = (await response.json()) as { sections?: PosSection[] };

    return body.sections ?? null;
  } catch {
    return null;
  }
}

/** A table as the till needs it: enough to open a bill against. */
export type PosTable = {
  id: number;
  label: string;
  seats: number;
  status: string;
  /**
   * Which room the table stands in — `hall` on the API's own resource.
   *
   * `name` is `null` unless the controller eager-loaded the relation, and the
   * floor screen has to cope with that rather than print "undefined" across the
   * top of a dining room: a zone with no name falls back to its id, and a
   * restaurant with one unnamed hall gets no rail at all, which is right —
   * a filter with one option is furniture.
   */
  zone: { id: number | null; name: string | null };
};

/**
 * The tables this terminal's branch can seat.
 *
 * Its own read rather than the console's `getFloor()`, for two reasons that
 * both matter. That one authenticates with the console session cookie, which a
 * paired tablet does not have; and it drops the table's id on the way through,
 * because the floor screen draws labels while the till has to open a bill
 * against a specific row.
 *
 * Inactive tables are filtered out here rather than by the caller: a table taken
 * out of service still exists — its QR code still resolves — but nobody should
 * be offered it.
 */
export async function fetchPosFloor(): Promise<PosTable[] | null> {
  const terminal = await pairedTerminal();
  const shift = await shiftToken();

  if (terminal === null || shift === null) return null;

  try {
    const response = await fetch(`${apiBase()}/tables/tables?per_page=200`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${shift}`,
        'X-Tenant': terminal.tenantSlug,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const body = (await response.json()) as {
      data?: {
        id: number;
        label: string;
        seats: number;
        status: string;
        is_active: boolean;
        hall?: { id: number | null; name?: string | null };
      }[];
    };

    return (body.data ?? [])
      .filter((table) => table.is_active)
      .map((table) => ({
        id: table.id,
        label: table.label,
        seats: table.seats,
        status: table.status,
        zone: { id: table.hall?.id ?? null, name: table.hall?.name ?? null },
      }));
  } catch {
    return null;
  }
}

/** How long a POS read waits before the screen decides it is on its own. */
const TIMEOUT_MS = 4_000;

/** Who is at the till and which till it is, as GET /v1/pos/auth/session answers. */
export type ShiftSession = {
  id: number;
  is_open: boolean;
  opened_at: string | null;
  /** The cash shift this session is filing money into, if one is open. */
  cash_shift_id: number | null;
  user?: {
    id: number;
    name: string;
    roles: string[];
    permissions?: string[];
    /**
     * The largest discount this person may apply at THIS till without anybody
     * else agreeing — whole percent, P9's ladder.
     *
     * `TerminalSessionResource` has sent this since the ceiling existed; the
     * client just never declared it, so the discount sheet drew a hard-coded 5
     * with a TODO asking for the number that was already in the payload. Five is
     * the cashier's row: a waiter saw four chips the server would refuse and a
     * manager saw one chip where they were entitled to four.
     */
    discount_ceiling?: number;
  };
  terminal?: {
    code: string;
    name: string;
    /**
     * Which room this till stands in.
     *
     * Read for one thing: the branch channel the order screen listens on, so a
     * waiter's chip turns amber when the kitchen accepts. The name below is what
     * the header prints; this is what the socket needs, and they are not
     * interchangeable — a channel keyed on a name would break the day two venues
     * were both called "Markaz".
     */
    branch_id?: number | null;
    branch?: { id: number; name: string } | null;
  };
};

/**
 * "I will count the float later."
 *
 * Read by the page so the skip actually sticks. Without it the skip reloaded to
 * a server that still saw no cash shift and drew the same screen again — a loop
 * with no way out but signing out.
 *
 * Not httpOnly and set by the client, because it is not a credential: forging
 * it skips a screen anybody can skip with the button. What it must NOT do is
 * outlive the shift, so it carries no max-age and dies with the browser
 * session, and handing the till back clears it explicitly.
 */
export const POS_TILL_SKIPPED_COOKIE = 'restaurant-campus-till-skipped';

export async function tillCountSkipped(): Promise<boolean> {
  const store = await cookies();

  return store.get(POS_TILL_SKIPPED_COOKIE)?.value === '1';
}

/**
 * Whether this person is the one who holds the cash.
 *
 * `pos.drawer` and not `pos.sell`: a waiter sells all evening and never opens
 * the drawer — they send food to the kitchen and the cashier settles. Asking a
 * waiter to count a float they will never touch would be a screen between them
 * and their tables for no reason.
 */
export function holdsTheDrawer(session: ShiftSession): boolean {
  return session.user?.permissions?.includes('pos.drawer') ?? false;
}

/**
 * Read the open shift, or null if there is not one.
 *
 * The order screen's header used to be two fixture strings — a hard-coded
 * terminal and a hard-coded name. A waiter called Malika signing in and
 * reading "Jasur Toshev" above her own order is worse than a blank: this is
 * the screen every void and every discount is attributed through, and the name
 * on it has to be the name in the audit trail.
 *
 * Null also covers the session having timed out server-side while the cookie
 * survived. The caller treats that as "nobody is signed in", which sends the
 * tablet back to the idle screen — the truthful answer, and the one that lets
 * the next person put their PIN in.
 */
export async function fetchShiftSession(): Promise<ShiftSession | null> {
  const terminal = await pairedTerminal();
  const token = await shiftToken();

  if (terminal === null || token === null) return null;

  try {
    const response = await fetch(`${apiBase()}/pos/auth/session`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Tenant': terminal.tenantSlug,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const body = (await response.json()) as { data?: ShiftSession } & ShiftSession;

    return body.data ?? body;
  } catch {
    return null;
  }
}

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

/**
 * The notes this restaurant counts in, for the till on this tablet.
 *
 * Read with the person's token rather than the device's: the endpoint sits
 * behind `finance.view`, which a cashier holds and a waiter does not — and a
 * waiter never reaches the count screen, because they hold no drawer.
 *
 * Falls back to the built-in eight rather than to nothing. A till has to open
 * when the network does not, and a count screen with no rows on it is a till
 * that cannot be opened at all.
 */
export async function fetchCashLadder(): Promise<CashLadder> {
  const terminal = await pairedTerminal();
  const shift = await shiftToken();

  if (terminal === null || shift === null) return FALLBACK_LADDER;

  try {
    const response = await fetch(`${apiBase()}/finance/denominations`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${shift}`,
        'X-Tenant': terminal.tenantSlug,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return FALLBACK_LADDER;

    return ladderFrom((await response.json()) as ApiCashLadder);
  } catch {
    return FALLBACK_LADDER;
  }
}

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
