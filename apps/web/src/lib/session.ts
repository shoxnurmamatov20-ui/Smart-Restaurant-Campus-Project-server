import { cookies } from 'next/headers';

import { ROLE_COOKIE } from './role-cookie';
import { roleFromServer, roleOrDefault, type Role, type SurfaceId } from './roles';
import { fetchContextWithToken, SESSION_COOKIE } from './server-session';

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
   * Whether the API answered, or this is the fixture console.
   *
   * Read it before showing anything that claims to be today's money: `false`
   * means every figure on the screen came from a `*-data.ts`.
   */
  live: boolean;
};

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
    const context = await fetchContextWithToken(token);
    const role = context ? roleFromServer(context.roles) : null;

    if (context && role) {
      return {
        user: { name: context.user.name, initials: initialsOf(context.user.name) },
        role,
        surface: role.surface,
        // A pinned branch is the one this person works at; unpinned reads the
        // whole business, which is what `null` means to every screen below.
        branchId: context.branch_pinned && context.branch ? String(context.branch.id) : null,
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
    live: false,
  };
}
