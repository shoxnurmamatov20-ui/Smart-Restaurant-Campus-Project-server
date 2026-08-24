import { NextResponse, type NextRequest } from 'next/server';

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from '@/i18n/locale';
import {
  URL_LOCALES,
  preferredLocale,
  skipsLocale,
  splitLocale,
  withLocale,
  type UrlLocale,
} from '@/lib/locale-path';

import { CREW_ROLE_COOKIE, crewRoleRedirect } from '@restaurant/surfaces/crew/guard';
import { CREW_SESSION_COOKIE } from '@/lib/crew-cookie';
import { ROLE_COOKIE } from '@/lib/role-cookie';
import { SESSION_COOKIE } from '@/lib/server-session';
import {
  landingPath,
  MODULE_PATHS,
  roleOrDefault,
  SURFACE_ACCESS,
  SURFACE_PATHS,
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

/**
 * The full-bleed surfaces, which are not sidebar rows.
 *
 * Paths come from SURFACE_PATHS rather than being written again here, because
 * app/robots.ts needs the same list to keep crawlers out of them and a surface
 * that appeared in one copy and not the other is a screen that is either
 * unguarded or unlisted, with nothing to say which.
 */
const GUARDED_SURFACES = (Object.keys(SURFACE_ACCESS) as (keyof typeof SURFACE_ACCESS)[]).map(
  (key) => [SURFACE_PATHS[key], SURFACE_ACCESS[key]] as const,
);

/**
 * Surfaces that carry their own front door, and must stay reachable without one.
 *
 * Two of the five, and for the same reason: neither authenticates with a
 * console password. A till exchanges an eight-character pairing code for a
 * device token and then a PIN for a shift; a staff phone does the same with an
 * enrolment code. Their first screen IS the sign-in, so sending an
 * unauthenticated visitor from `/pos` to `/login` would send a cashier to a
 * form they have no account for and make the till unusable.
 *
 * `/platform`, `/setup` and `/mobile` are not here. All three are read behind a
 * console session — the platform console additionally behind TOTP on the API —
 * and none of them has a door of its own to show a stranger.
 */
const OWN_FRONT_DOOR: readonly string[] = ['/pos', '/crew'];

/**
 * Whether a path may be opened by somebody who is not signed in at all.
 *
 * This is the check that was missing, and its absence was the single worst
 * thing in this application: `roleOrDefault()` answers `owner` for a request
 * with no role cookie — which is correct as a *display* default and catastrophic
 * as an access decision. A stranger who typed `/dashboard` was handed the
 * owner's console: named branches, named staff, named customers, the ledger,
 * the till and the wizard that creates a restaurant.
 *
 * `robots.ts` had already written the reason down — "middleware.ts sorts roles,
 * it does not authenticate" — and kept crawlers out. Nothing kept people out.
 *
 * **Still not authorisation.** A cookie is something the browser owns, so this
 * proves nothing about who the visitor is; the API decides that per request
 * against the Sanctum token, and it always did. What this fixes is a screen
 * full of somebody's business rendering for anyone who guessed the URL.
 */
export function needsASession(pathname: string): boolean {
  for (const prefix of OWN_FRONT_DOOR) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return false;
  }

  for (const [prefix] of GUARDED_SURFACES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return true;
  }

  for (const [path] of GUARDED_ROUTES) {
    if (pathname === path || pathname.startsWith(`${path}/`)) return true;
  }

  return false;
}

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

/**
 * The three languages a page can be written in, and how a request picks one.
 *
 * This is not the API's `X-Locale` chain and must not be confused with it: that
 * one decides which language the *data* comes back in and can read a signed-in
 * user's preference. This decides one attribute — `<html lang>` — and it has to
 * be decided here rather than in the layout, because the layout cannot see
 * `?lang=`. Next resolves `searchParams` per page, and a root layout has none.
 *
 * Why it matters enough to run on every request: a Russian page that announces
 * `lang="uz"` tells a screen reader to pronounce Russian with Uzbek phonetics,
 * and tells a crawler the page is Uzbek. On the restaurant site — the one
 * surface built to be found by strangers, in three languages — that is the
 * difference between ranking for a Russian query and not appearing at all.
 */
/** The header the root layout reads. Request-scoped; never sent to a browser. */
export const DOC_LANG_HEADER = 'x-doc-lang';

/*
 * There used to be a `docLang()` here that read `?lang=` and then
 * `Accept-Language`, and it was the fifth of five places this codebase decided
 * what language a reader was owed. It is gone: the answer is the first segment
 * of the path now, and there is nothing left for it to guess.
 */

/**
 * The three paths that get a language but no guard.
 *
 * They used to be cut out of the matcher, which meant this file never ran on
 * them at all. It has to run on them now — every URL on the site carries a
 * language, and one that does not is a redirect waiting to happen — so the
 * exemption moved from the matcher into the function, where it is the same
 * exemption written where it can be read.
 */
function isUrlLocale(value: string | null): value is UrlLocale {
  return value !== null && (URL_LOCALES as readonly string[]).includes(value);
}

const GUARDS_SKIP: readonly string[] = ['/login', '/forgot-password', '/design'];

function guarded(bare: string): boolean {
  return !GUARDS_SKIP.some((open) => bare === open || bare.startsWith(`${open}/`));
}

/**
 * Which `/crew` paths are the door, and which are behind it.
 *
 * The staff app is exempt from the console session guard because its first
 * screen *is* the sign-in — but that exemption was applied to the whole
 * subtree, so `/crew/owner/branches` rendered for anyone who typed it. The
 * fixtures behind it are named branches and named staff.
 *
 * The three below stay open because they have to: `/crew` is the PIN pad,
 * `/crew/lock` is what a locked handset shows, and `/crew/enrol` and
 * `/crew/session` are the handlers those two post to. Everything else under
 * `/crew/` is somebody's shift.
 *
 * **This is a display guard, not authorisation.** The cookie proves nothing —
 * the API checks the token on every request it serves. What this stops is a
 * screen full of a restaurant's business rendering for a stranger who guessed
 * a URL, which is the same thing `needsASession` stops for the console.
 */
/*
 * `/crew` exactly, not `/crew/…`.
 *
 * The distinction is the whole guard: listing it as a prefix reopens every
 * shift screen under it, which is the bug this function exists to close. The
 * three below ARE prefixes — `/crew/lock/waiter` is a locked handset.
 */
const CREW_DOOR = '/crew';

const CREW_OPEN_PREFIXES: readonly string[] = ['/crew/lock', '/crew/enrol', '/crew/session'];

export function crewNeedsPin(pathname: string): boolean {
  if (pathname !== CREW_DOOR && !pathname.startsWith(`${CREW_DOOR}/`)) return false;
  if (pathname === CREW_DOOR) return false;

  for (const open of CREW_OPEN_PREFIXES) {
    if (pathname === open || pathname.startsWith(`${open}/`)) return false;
  }

  return true;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // A file, an API route or one of Next's own metadata routes. None of them is
  // a page a person reads, and every one of them 404s at a moved URL.
  if (skipsLocale(pathname)) return NextResponse.next();

  const { locale: fromPath, bare } = splitLocale(pathname);

  /*
   * Did this request already come through here?
   *
   * The rewrite below hands the router the path with the language taken off,
   * and behind a proxy Next can decide that rewrite is *external* and run the
   * whole pipeline again on it — pathname `/`, no language, so the branch
   * below sends it to `/uz`, which rewrites to `/`, which comes back here.
   * That loop took the site down: every URL answered 308 to itself.
   *
   * The header our own rewrite sets is what tells the second pass apart from a
   * stranger typing an address. It is *not* trusted for anything else: an
   * outside caller can send `x-doc-lang` too, and if this returned early on
   * it, `x-doc-lang: uz` plus `/dashboard` would be a way past every guard in
   * this file. So it only supplies the language — the guards below still run,
   * on the same bare path they always see.
   */
  const carried = request.headers.get(DOC_LANG_HEADER);
  const reentry = fromPath === null && isUrlLocale(carried);
  const locale = fromPath ?? (reentry ? (carried as UrlLocale) : null);

  /*
   * No language in the path — put one there and send them to it, once.
   *
   * 308 and not 302: the move is permanent, and the method has to survive it.
   * A 302 lets a client turn a POST into a GET, and `/api` is already out
   * above, but the crew handlers under `/crew/session` are not.
   *
   * This is also the whole of `/` → `/uz`. There is no unprefixed form of any
   * page on this site, which is the point: one URL per language, and a reader
   * who shares the one they are reading shares the language they read it in.
   */
  if (locale === null) {
    const wanted = preferredLocale(
      request.cookies.get(LOCALE_COOKIE)?.value,
      request.headers.get('accept-language') ?? '',
    );
    const url = request.nextUrl.clone();

    url.pathname = withLocale(bare, wanted);

    return NextResponse.redirect(url, 308);
  }

  /*
   * `/uz/register` → `/uz#contact`, keeping the language across the forward.
   *
   * The table is written in bare paths because that is what it is about; the
   * fragment is split off first because `withLocale` is a path function and
   * `/uz/#contact` is a different URL from `/uz#contact` to a browser.
   */
  const forward = FORWARDS[bare];

  if (forward) {
    const [path = '/', hash] = forward.split('#');
    const target = withLocale(path === '' ? '/' : path, locale) + (hash ? `#${hash}` : '');

    return NextResponse.redirect(new URL(target, request.url), 308);
  }

  /*
   * From here down, every guard sees the path it has always seen.
   *
   * That is the reason this migration did not move 106 pages into an
   * `app/[locale]` tree. The five checks below — the crew PIN, the crew role,
   * the console session, the module guard and its landing-page fallback —
   * compare raw prefixes like `/dashboard` and `/crew/lock`, and rewriting all
   * five to understand a language segment is five chances to open a hole in
   * the thing that decides who may read a restaurant's takings. Stripping the
   * segment once, here, is one chance, and it is this line.
   *
   * `bare` goes to the guards; `send()` puts the language back on whatever
   * they decide; `pass()` hands the unprefixed path to the router, so the app
   * inside is the app that was there yesterday.
   */
  const headers = new Headers(request.headers);

  headers.set(DOC_LANG_HEADER, locale);

  /*
   * The rewrite's origin has to be the origin the router computed, and neither
   * `request.url` nor `request.nextUrl` is it. This cost two outages.
   *
   * Next decides whether a rewrite is internal by comparing origins
   * (`server/web/adapter.js`, `relativize-url.js:29`). If they differ it reads
   * the rewrite as a jump to another server and opens a real connection to it
   * — over TLS, when the scheme says https — at a port speaking plain HTTP.
   * `EPROTO`, 500, every page on the public name.
   *
   * Behind nginx the three candidates disagree:
   *
   *   request.url        https://localhost:3000/uz   scheme from XFP, host from the socket
   *   request.nextUrl    https://localhost:3000/uz   same
   *   what the router wants  https://mypos.tashmedunitf.uz/uz
   *
   * The service binds `127.0.0.1:3000`, so the socket host is never the name
   * anybody typed. `X-Forwarded-Host` — which this nginx sends — is, and the
   * `Host` header is the fallback for an edge that does not.
   *
   * Reproducing it needs all three of an external `Host`, `X-Forwarded-Proto:
   * https`, and the server bound to the loopback. Miss any one and it passes,
   * which is why a dev server, a `next start` on localhost, and a LAN request
   * all looked fine while the public address answered 500:
   *
   *     next start -H 127.0.0.1 -p 3211
   *     curl http://127.0.0.1:3211/uz -H 'Host: mypos.tashmedunitf.uz' \
   *          -H 'X-Forwarded-Proto: https' -H 'X-Forwarded-Host: mypos…'
   *
   * One shape still fails and it cannot occur here: a `Host` naming a *foreign*
   * name with an explicit port. This service is only reachable through nginx,
   * which sends `$host` without one.
   */
  const inner = new URL(
    `${request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')}://` +
      `${request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host}` +
      `${bare}${request.nextUrl.search}`,
  );

  inner.pathname = bare;

  /*
   * Serving a prefixed page also records which language it was.
   *
   * This is what keeps the ~140 links in the app that are still written
   * unprefixed — `href="/mp/cart"` — from throwing a reader out of the
   * language they are reading. Such a link lands back at the top of this
   * function with no prefix, and the only thing that can tell it apart from a
   * stranger typing the address is a memory of the last page served. So the
   * memory is written from the URL rather than only from the switcher: a
   * reader who arrives on `/ru/mp` from a shared link, having never chosen
   * anything, still gets `/ru/mp/cart` when they tap the basket.
   *
   * It costs one redirect on those links and nothing on the ones already
   * prefixed, which is why the navigation people actually use — the docks, the
   * rails, the site header — carries the language in its hrefs.
   */
  const pass = () => {
    // Already the bare path on a second pass — there is nothing left to strip,
    // and rewriting it again is the loop this guards against.
    const answer = reentry
      ? NextResponse.next({ request: { headers } })
      : NextResponse.rewrite(inner, { request: { headers } });

    if (request.cookies.get(LOCALE_COOKIE)?.value !== locale) {
      answer.cookies.set(LOCALE_COOKIE, locale, {
        path: '/',
        maxAge: LOCALE_COOKIE_MAX_AGE,
        sameSite: 'lax',
      });
    }

    return answer;
  };
  const send = (to: string, from?: UrlLocale) =>
    NextResponse.redirect(new URL(withLocale(to, from ?? locale), request.url));

  if (!guarded(bare)) return pass();

  /*
   * A shift screen with no shift on the handset goes back to the PIN pad.
   *
   * Before the console check, because the two doors are different: a waiter has
   * no console account and sending them to `/login` would be sending them to a
   * form they cannot fill in.
   */
  if (crewNeedsPin(bare) && !request.cookies.has(CREW_SESSION_COOKIE)) {
    return send('/crew');
  }

  /*
   * And the role in the path is the role the PIN opened.
   *
   * The session guard above only asks whether *somebody* is signed in. The role
   * is a path segment — `/crew/owner/branches` — so without this a signed-in
   * waiter could type the owner's URL and read five branches' revenue, margin
   * and headcount. The design is explicit that the PIN is what decides
   * (`dc.html:1188`, spec 03 §7), and `crew/[role]/layout.tsx` had the check
   * written down as owed.
   *
   * `/crew/lock/<role>` is covered too, and it is not an afterthought: the lock
   * screen's notifications are per role, and an owner's says today's takings
   * across every branch.
   *
   * Same standing as everything else in this file — a display guard over a
   * cookie, not authorisation. The API refuses the data.
   */
  const ownWorkspace = crewRoleRedirect(bare, request.cookies.get(CREW_ROLE_COOKIE)?.value);

  if (ownWorkspace !== null) return send(ownWorkspace);

  if (needsASession(bare) && !request.cookies.has(SESSION_COOKIE)) {
    const login = new URL(withLocale('/login', locale), request.url);

    /*
     * Where they were going, so signing in finishes the journey.
     *
     * Path and query only, never the whole URL: an absolute `next` that a
     * caller controls is an open redirect, and a sign-in form is exactly where
     * one gets used. Rebuilt against our own origin below, so a `next` naming
     * another host cannot survive it.
     *
     * The language stays on it. Sending a Russian reader back to the Uzbek
     * copy of the page they asked for is losing the only thing they told us.
     */
    login.searchParams.set('next', pathname + request.nextUrl.search);

    /*
     * No second argument. `NextResponse.redirect(url, init)` takes a
     * *response* init, and handing it the request headers assembled above would
     * copy every inbound header — cookies included — onto the response.
     */
    return NextResponse.redirect(login);
  }

  const role = roleOrDefault(request.cookies.get(ROLE_COOKIE)?.value);
  const allowed = isAllowed(role, bare);

  if (allowed !== false) return pass();

  const home = landingPath(role);

  // A role whose landing page is itself refused would bounce forever. That
  // cannot happen with the nine defined today — every one lands on a surface
  // or a row it holds, the operator on `/calls` rather than a dashboard — but
  // the guard costs a comparison and removes the class of bug entirely.
  if (bare === home) return pass();

  return send(home);
}

export const config = {
  /**
   * Everything but Next's own assets and the API.
   *
   * It used to exclude the sign-in pages, `/design` and the site root as well,
   * because this file was only ever a role guard and those four have no role
   * to check. They are in now: every URL on this site carries a language, so
   * every URL has to reach the one place that can put one there. What they are
   * still exempt from is the *guards*, and that exemption moved into
   * `GUARDS_SKIP` above, where the reason for it can be written down.
   *
   * `/api` stays out because prefixing a contract with a human's reading
   * language is meaningless, and a middleware invocation per API call is not.
   * Files and metadata routes are handled by `skipsLocale`, which the matcher
   * cannot express: "a last segment with a dot in it" is not a prefix.
   */
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
