import { NextResponse, type NextRequest } from 'next/server';

import { ROLE_COOKIE } from '@/lib/role-cookie';
import {
  landingPath,
  MODULE_PATHS,
  roleOrDefault,
  SURFACE_ACCESS,
  type ModuleKey,
  type Role,
} from '@/lib/roles';

/**
 * Turning a role away from a screen it does not hold.
 *
 * The sidebar already declines to draw those rows, but a sidebar is a list of
 * suggestions: a waiter who types `/finance` would otherwise get the finance
 * screen, and the fact that its figures are placeholders today does not make
 * that acceptable tomorrow. Filtering navigation without guarding routes is the
 * usual way an app ends up with a permission model that is really a menu.
 *
 * Middleware rather than a check inside each page: it runs before any render,
 * it cannot be forgotten when the twentieth screen is added, and it answers
 * with a redirect rather than a flash of a screen the reader may not see.
 *
 * **Still not authorisation.** This reads a cookie, and a cookie is something
 * the browser owns — see lib/role-cookie.ts. It keeps an honest reader out of
 * the wrong screen; it does not keep a dishonest one out of the data. The data
 * is the API's to defend, per request, against the Sanctum token, and
 * `RolePermissionTest` on that side is what proves it.
 */

/** Longest path first, so `/finance/till` matches before `/finance`. */
const GUARDED_ROUTES: readonly (readonly [string, ModuleKey])[] = (
  Object.entries(MODULE_PATHS) as [ModuleKey, string][]
)
  .map(([module, path]) => [path, module] as const)
  .sort((a, b) => b[0].length - a[0].length);

/** The full-bleed surfaces, which are not sidebar rows. */
const GUARDED_SURFACES = [
  ['/pos', SURFACE_ACCESS.pos],
  ['/mobile', SURFACE_ACCESS.mobile],
  ['/platform', SURFACE_ACCESS.super],
] as const;

/**
 * Whether this role may open this path.
 *
 * `null` means the path is not one we guard — the marketing site, sign-in, the
 * design gallery — and the request passes through untouched.
 */
function isAllowed(role: Role, pathname: string): boolean | null {
  for (const [prefix, roles] of GUARDED_SURFACES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return roles.includes(role.id);
    }
  }

  for (const [path, module] of GUARDED_ROUTES) {
    if (pathname === path || pathname.startsWith(`${path}/`)) {
      return role.nav.includes(module);
    }
  }

  return null;
}

/**
 * Routes that only forward somewhere else.
 *
 * `/register` is here rather than in a page because Next renders a `redirect()`
 * whose target carries a fragment as a one-second meta refresh — a blank page,
 * then the move. A `Location` header carries the fragment perfectly well, so
 * the redirect belongs at the edge. Why it forwards at all is in
 * app/(auth)/register/page.tsx, which is kept as the place that explains it.
 */
const FORWARDS: Readonly<Record<string, string>> = {
  '/register': '/#contact',
};

export function middleware(request: NextRequest) {
  const forward = FORWARDS[request.nextUrl.pathname];
  if (forward) return NextResponse.redirect(new URL(forward, request.url), 308);

  const role = roleOrDefault(request.cookies.get(ROLE_COOKIE)?.value);
  const allowed = isAllowed(role, request.nextUrl.pathname);

  if (allowed !== false) return NextResponse.next();

  const home = landingPath(role);

  // A role whose landing page is itself refused would bounce forever. That
  // cannot happen with the eight defined today — every one lands on a surface
  // or a row it holds — but the guard costs a comparison and removes the class
  // of bug entirely.
  if (request.nextUrl.pathname === home) return NextResponse.next();

  return NextResponse.redirect(new URL(home, request.url));
}

export const config = {
  /**
   * Everything except Next's own assets and the public surfaces.
   *
   * The marketing site and sign-in have no role to check — they are what a
   * reader sees *before* there is a session — and running the guard over static
   * files would cost a middleware invocation per image for no answer.
   *
   * `/register` is *not* excluded: it has no role check either, but it is
   * forwarded here, and a path the matcher skips never reaches this file.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login|forgot-password|design|$).*)'],
};
