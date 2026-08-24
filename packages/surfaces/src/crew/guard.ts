/**
 * Which role is holding the phone, in a module the edge runtime can read.
 *
 * The design is unambiguous about where a role comes from: `dc.html:1188` maps
 * four digits to one of five workspaces and nothing else in the app changes it
 * — "the role from the PIN decides everything". The build put the role in the
 * URL instead (`/crew/<role>/…`), which is right for addressability — a push
 * notification's whole job is to open the app *at a place* — and wrong the
 * moment nothing compares the segment to the session. Any signed-in waiter
 * could type `/crew/owner/branches` and read five branches' revenue, headcount
 * and margin. `crew/[role]/layout.tsx` had already written that check down as
 * owed; this is it.
 *
 * **Why a separate file from `crew-data.ts`.** `middleware.ts` runs on the edge
 * runtime and is bundled on its own, and `crew-data.ts` is two thousand lines
 * of fixtures — every branch, every dish, every push. Importing the role
 * vocabulary from there would drag all of it into the middleware bundle that
 * runs on every request in the application. So the vocabulary lives here and
 * `crew-data.ts` re-exports it: one declaration, two runtimes, exactly the
 * split `lib/crew-cookie.ts` already makes for the cookie names.
 *
 * Nothing in here imports anything. That is a constraint, not a coincidence.
 */

/**
 * The five roles this app is for, and the four it is deliberately not for.
 *
 * Cashier, kitchen and accountant are excluded by the design, each for a
 * physical reason rather than a permissions one: a cashier stands at a fixed
 * station with a drawer and a printer, a cook has wet hands and reads a wall
 * screen, and an accountant works in columns that do not fit in 390px. Adding
 * them here would mean shipping three screens nobody can use where they stand.
 */
export type CrewRole = 'owner' | 'manager' | 'storekeeper' | 'waiter' | 'courier';

export const CREW_ROLES: readonly CrewRole[] = [
  'owner',
  'manager',
  'storekeeper',
  'waiter',
  'courier',
];

export function isCrewRole(value: string): value is CrewRole {
  return (CREW_ROLES as readonly string[]).includes(value);
}

/**
 * The server's role names, mapped onto this app's five surfaces.
 *
 * Two vocabularies that will not be merged. The server names a permission set —
 * `branch-manager`, `storekeeper`, `chef` — and this app names a *workspace*: a
 * screen with a dock, a header and a set of tabs. They line up for four roles
 * and deliberately not for the rest.
 *
 * Everything unmapped answers null, which is the honest result rather than a
 * default. A cashier signing in on a phone has no staff-app surface — theirs is
 * the till — and dropping them onto the waiter's screen would show them
 * somebody else's tables. `roles.ts` makes the same call for the console with
 * `no_surface`, and for the same reason.
 */
const SERVER_ROLE_TO_SURFACE: Readonly<Record<string, CrewRole>> = {
  owner: 'owner',
  'branch-manager': 'manager',
  storekeeper: 'storekeeper',
  waiter: 'waiter',
  courier: 'courier',
};

/** The first of a person's roles that this app has a workspace for. */
export function crewSurfaceFor(serverRoles: readonly string[]): CrewRole | null {
  for (const role of serverRoles) {
    const surface = SERVER_ROLE_TO_SURFACE[role];

    if (surface !== undefined) return surface;
  }

  return null;
}

/* ============================================================
   The fourth crew cookie: which workspace the PIN opened
   ============================================================ */

/**
 * The workspace the PIN resolved to. Written beside the session, never alone.
 *
 * A fourth cookie rather than a claim decoded out of the session token: the
 * token is Sanctum's, opaque to this application, and the only party that can
 * read it is the API. The role arrives in the same response the token does
 * (`person.roles`), so recording it costs nothing and gives the edge something
 * to compare a path segment against.
 *
 * **It is a display guard, not authorisation** — the same standing the console's
 * `ROLE_COOKIE` has, and for the same reason: a cookie is something the browser
 * owns. What it stops is an honest reader reaching a screen that is not theirs.
 * What stops a dishonest one is the API, which checks the Sanctum token against
 * Spatie permissions on every request that carries real data.
 *
 * Its lifetime is the session's — it is set and cleared in the same two places,
 * `crew/session/route.ts`, so a handset can never hold one without the other
 * for longer than a single response.
 */
export const CREW_ROLE_COOKIE = 'restaurant-campus-crew-role';

/** `/crew/waiter/tables` → `waiter`. Null when the path names no role. */
export function crewRoleInPath(pathname: string): string | null {
  /*
   * `/crew/lock/<role>` is a locked handset, not a workspace — the role is the
   * second segment there. Both shapes are checked, because a lock screen draws
   * the notifications of exactly one person: an owner's says today's takings
   * across five branches.
   */
  const parts = pathname.split('/').filter(Boolean);

  if (parts[0] !== 'crew') return null;

  const segment = parts[1] === 'lock' ? parts[2] : parts[1];

  return segment ?? null;
}

/**
 * Where a mismatched request has to go instead, or null when it may pass.
 *
 * Three outcomes, and they are different on purpose:
 *
 *   - the path names no role, or names one this app does not have → `null`,
 *     and the route itself answers with a 404. A guard that redirected here
 *     would turn every typo into a silent bounce to somebody's dashboard.
 *   - the handset has a session but no role beside it → back to the keypad.
 *     That pairing only happens to a session opened before this cookie
 *     existed, and the cheapest honest answer is four digits: the next PIN
 *     writes both.
 *   - the segment and the cookie disagree → the reader's own workspace, at
 *     the same tab depth they asked for is *not* attempted. `/crew/<role>`
 *     lands on that role's first tab, which is a different screen per role —
 *     an owner has no `tables` and a waiter has no `branches`.
 */
export function crewRoleRedirect(pathname: string, roleCookie: string | undefined): string | null {
  const segment = crewRoleInPath(pathname);

  if (segment === null || !isCrewRole(segment)) return null;

  if (roleCookie === undefined || !isCrewRole(roleCookie)) {
    /*
     * A locked handset with no session at all is a real state — the phone is
     * on a pass with the app open — and it has to keep rendering. Only the
     * workspace is refused when there is nothing to check against.
     */
    return pathname.startsWith('/crew/lock/') ? null : '/crew';
  }

  return roleCookie === segment ? null : `/crew/${roleCookie}`;
}
