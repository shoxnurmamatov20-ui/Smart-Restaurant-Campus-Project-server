import { cookies } from 'next/headers';

import { BRANCH_COOKIE } from './branch-cookie';
import { ROLE_COOKIE } from './role-cookie';
import { roleFromServer, roleOrDefault, type Role, type SurfaceId } from './roles';
import { type AuthContext, fetchContextWithToken, SESSION_COOKIE } from './server-session';

/**
 * Who is asking, as far as a server render is concerned.
 *
 * Two sources, in order. A real session first: the httpOnly cookie set by
 * /api/auth/session holds a Sanctum token, and `GET /api/v1/auth/context`
 * answers with the person, their restaurant, their branch and their roles. The
 * demo cookie second, for a build with no API behind it — which is every
 * screenshot taken of this console so far.
 *
 * The fallback is deliberate and it is not a hole. What it decides is *which
 * fixtures to draw*; what a request may actually touch is decided by the API
 * against the token, per request, and `DesignRoleMatrixTest` on that side is
 * what proves it. A browser that invents a role cookie changes the picture it
 * is shown and nothing else.
 *
 * **Calling this opts a page out of static rendering** — it reads a cookie.
 * That is correct for every screen behind a sign-in and wrong for the marketing
 * site, which is why the public routes never import it.
 *
 * Server-only. `next/headers` throws in a client component, and the module is
 * kept out of the browser bundle by never being imported from one; the cookie
 * name and the writer live in ./role-cookie.ts for that reason.
 */
export type Session = {
  user: {
    /** Display name. A proper noun — not translated. */
    name: string;
    /** Two letters for the avatar. */
    initials: string;
  };
  /** The role this render is drawn for. */
  role: Role;
  /** Which client this is: the sidebar console, the tablet, the wall screen. */
  surface: SurfaceId;
  /**
   * The venue the figures are about, or `null` for all of them.
   *
   * Empty is not a hole here — it is the sum. An owner reading with no branch
   * chosen is reading the whole business, which is exactly how the API treats
   * an absent `X-Branch` header.
   */
  branchId: string | null;
  /**
   * The same venue, by the name `X-Branch` takes.
   *
   * The slug rather than the id, because that is what the header is keyed on
   * and what the cookie holds — see lib/branch-cookie.ts. The switcher matches
   * its rows against this, and it is the value the whole console's reads were
   * scoped by when this render happened.
   */
  branchSlug: string | null;
  /**
   * Whether this reader may choose a different venue.
   *
   * False is the interesting case: somebody whose user row carries a
   * `branch_id` is scoped to their venue by the server whatever any header
   * said, so the switcher is a label for them rather than a control. Drawing
   * the control anyway would be offering a choice the API refuses.
   */
  branchPinned: boolean;
  /**
   * What the figures are called on screen: the pinned venue's name, or the
   * restaurant's own when the reader sees the whole business. The greeting
   * line on the dashboard says "{place} is 12% ahead of yesterday", and a
   * place has to have a name.
   */
  placeName: string;
  /**
   * Whether the API answered, or this is the fixture console.
   *
   * Read it before showing anything that claims to be today's money: `false`
   * means every figure on the screen came from a `*-data.ts`.
   */
  live: boolean;
};

/**
 * What the figures on screen are about.
 *
 * The pinned venue, else the restaurant, else — for a platform operator, who
 * belongs to no restaurant and whose context carries `tenant: null` — the
 * product's own name. The third case is the one that was missing: the first
 * version read `context.tenant.name` unguarded, and the super-admin's every
 * page answered 500 with a React #441 until it was typed honestly.
 */
export function placeNameOf(
  context: Pick<AuthContext, 'branch' | 'branch_pinned' | 'tenant'>,
): string {
  if (context.branch_pinned && context.branch) return context.branch.name;

  return context.tenant?.name ?? 'Smart Restaurant';
}

/** Two letters for the avatar, from whatever the person is actually called. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? '';

  return (first + second).toUpperCase() || '··';
}

/**
 * The session for this request.
 *
 * Never throws. An expired token, an API mid-restart and a browser with no
 * cookie at all take the same path: the demo role, which is a coherent screen
 * rather than a 500.
 */
export async function getSession(): Promise<Session> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    /*
     * The venue chosen in the top bar, asked for by name.
     *
     * The endpoint answers the branch the REQUEST resolved to, so sending the
     * header is what makes the greeting say the venue whose figures are on the
     * page. A cookie naming a venue that has since closed answers null and is
     * asked again without it, which lands on the roll-up — the same one-time
     * retry `lib/api-server.ts` makes, for the same reason.
     */
    const chosen = store.get(BRANCH_COOKIE)?.value;

    const context =
      (await fetchContextWithToken(token, chosen)) ??
      (chosen === undefined ? null : await fetchContextWithToken(token));

    const role = context ? roleFromServer(context.roles) : null;

    if (context && role) {
      return {
        user: { name: context.user.name, initials: initialsOf(context.user.name) },
        role,
        surface: role.surface,
        /*
         * The venue this render is scoped to — pinned OR chosen.
         *
         * It used to be the pinned branch alone, which was correct while the
         * switcher was a label and wrong the moment it became a control: the
         * shell would have highlighted nothing while every figure on the page
         * belonged to one venue.
         */
        branchId: context.branch ? String(context.branch.id) : null,
        branchSlug: context.branch?.slug ?? null,
        branchPinned: context.branch_pinned,
        placeName: placeNameOf(context),
        live: true,
      };
    }
  }

  const role = roleOrDefault(store.get(ROLE_COOKIE)?.value);

  return {
    user: { name: role.person, initials: role.initials },
    role,
    surface: role.surface,
    branchId: 'chilonzor',
    branchSlug: 'chilonzor',
    // The demo console is not pinned: the switcher is part of the design and a
    // reviewer looking through it should be able to open it.
    branchPinned: false,
    placeName: 'Chilonzor',
    live: false,
  };
}
