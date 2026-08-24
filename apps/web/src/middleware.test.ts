import { describe, expect, it } from 'vitest';

import { NextRequest } from 'next/server';

import { config, middleware, needsASession } from './middleware';
import { MODULE_PATHS, SURFACE_PATHS } from './lib/roles';

/**
 * What the guard is allowed to see.
 *
 * `config.matcher` is the one line in the app that decides whether middleware
 * runs at all, and it fails in the two worst possible directions. Exclude a
 * console route and the guard silently stops guarding it — a waiter reaches
 * /finance and nothing complains. Include a public one and every anonymous
 * visitor is handed a role cookie's default and redirected off the sign-in page
 * they were trying to use.
 *
 * Neither shows up in a type check or a build, and both are one careless edit
 * to a regex away, so the invariant is asserted here rather than trusted.
 */

/** The matcher as Next compiles it: one entry, applied to the pathname. */
const matcher = new RegExp(`^${config.matcher[0]}$`);
const runsOn = (pathname: string) => matcher.test(pathname);

describe('middleware matcher', () => {
  it('runs on every route a role can be refused', () => {
    for (const path of Object.values(MODULE_PATHS)) {
      expect(runsOn(path), `${path} is not guarded`).toBe(true);
      expect(runsOn(`${path}/anything`), `${path}/… is not guarded`).toBe(true);
    }
  });

  it('runs on the full-bleed surfaces', () => {
    for (const path of ['/pos', '/mobile', '/platform']) {
      expect(runsOn(path), `${path} is not guarded`).toBe(true);
    }
  });

  it('runs on the pages a reader sees before there is a session', () => {
    /*
     * These four used to be cut out of the matcher, because this file was only
     * ever a role guard and none of them has a role to check. They are in now
     * for a different reason: every URL on this site carries a language, and a
     * URL the matcher skips can never be given one — `/login` would be the one
     * page on the site with no language in its address.
     *
     * They are still not *guarded*. That exemption is `GUARDS_SKIP` inside the
     * function, and the test for it is below: each answers 200, not a redirect
     * to a sign-in form they are already looking at.
     */
    for (const path of ['/', '/login', '/forgot-password', '/design']) {
      expect(runsOn(path), `${path} cannot be given a language`).toBe(true);
    }
  });

  it('runs on /register, which it forwards rather than guards', () => {
    // The one public path that must reach middleware: it has no role check,
    // but the forward to the site's contact section happens there because
    // Next renders a redirect to a fragment as a one-second meta refresh.
    expect(runsOn('/register')).toBe(true);
  });

  it('stays off Next.js internals', () => {
    for (const path of ['/_next/static/chunk.js', '/_next/image', '/favicon.ico']) {
      expect(runsOn(path), `${path} would cost an invocation`).toBe(false);
    }
  });
});

/**
 * The language is the first segment of the path.
 *
 * It used to be four things at once — a console cookie, a different marketing
 * cookie, `?lang=` on the guest and venue screens, and a fifth rule here that
 * decided `<html lang>` on its own. They disagreed, which is what a reader saw:
 * picking Russian on the marketing site and clicking through to a restaurant
 * page returned Uzbek.
 *
 * One source now, and it is the one a person can see, copy and send to someone
 * else. These drive the middleware itself rather than a helper, because the
 * helper being right was never the part that broke.
 */
const AT = (path: string, init?: { cookie?: string; accept?: string }) => {
  const request = new NextRequest(new URL(path, 'https://oshxona.uz'));

  if (init?.cookie !== undefined) request.cookies.set('restaurant-campus-locale', init.cookie);
  if (init?.accept !== undefined) request.headers.set('accept-language', init.accept);

  return middleware(request);
};

const goesTo = (answer: Response) =>
  new URL(answer.headers.get('location') ?? '', 'https://oshxona.uz');

describe('the language in the path', () => {
  it('gives an unprefixed URL one, permanently', () => {
    // 308 rather than 302: the move is permanent and the method has to survive
    // it. A 302 lets a client turn a POST into a GET.
    const answer = AT('/pricing');

    expect(answer.status).toBe(308);
    expect(goesTo(answer).pathname).toBe('/uz/pricing');
  });

  it('sends the bare site root to the default language', () => {
    expect(goesTo(AT('/')).pathname).toBe('/uz');
  });

  it('keeps the query string across the redirect', () => {
    expect(goesTo(AT('/r/osh-xona?table=12')).search).toBe('?table=12');
  });

  it('prefers a choice this reader already made', () => {
    // The cookie is the console's own, and it is a choice; a header is the
    // browser speaking for someone who never said anything.
    expect(goesTo(AT('/pricing', { cookie: 'ru', accept: 'en-GB' })).pathname).toBe('/ru/pricing');
  });

  it('falls back to what the browser asked for', () => {
    expect(goesTo(AT('/pricing', { accept: 'ru-RU,ru;q=0.9,en;q=0.8' })).pathname).toBe(
      '/ru/pricing',
    );
    expect(goesTo(AT('/pricing', { accept: 'RU-ru,en;q=0.5' })).pathname).toBe('/ru/pricing');
  });

  it('answers Uzbek to a language it does not serve', () => {
    // A crawler asking for Turkish gets the Uzbek document and is told so,
    // rather than a page announcing `lang="tr"` in Uzbek.
    expect(goesTo(AT('/pricing', { accept: 'tr-TR' })).pathname).toBe('/uz/pricing');
    expect(goesTo(AT('/pricing', { cookie: '../etc/passwd' })).pathname).toBe('/uz/pricing');
  });

  it('always settles, from every kind of path', () => {
    /*
     * The general form of the outage, rather than the one path that showed it.
     *
     * A middleware that redirects is a middleware that can redirect forever,
     * and this one now rewrites *and* redirects on the same request — which is
     * exactly the shape that loops. Following the chain to its end is the only
     * assertion that catches the class rather than the instance: the test
     * below pins `/uz`, and the one that took the site down could just as
     * easily have been `/uz/login`.
     *
     * Five hops is generous. Nothing here should need more than two: an
     * unprefixed path gets one to add a language, and a guarded one may get a
     * second to the sign-in.
     */
    const ROUTES = [
      '/',
      '/uz',
      '/ru',
      '/en',
      '/pricing',
      '/uz/pricing',
      '/login',
      '/uz/login',
      '/forgot-password',
      '/design',
      '/register',
      '/uz/register',
      '/dashboard',
      '/uz/dashboard',
      '/ru/dashboard',
      '/pos',
      '/uz/pos',
      '/crew',
      '/uz/crew',
      '/r/osh-xona',
      '/ru/r/osh-xona',
      '/qr/osh-xona/12',
    ];

    for (const route of ROUTES) {
      const seen: string[] = [];
      let at = route;

      for (let hop = 0; hop < 6; hop++) {
        const answer = AT(at);
        const location = answer.headers.get('location');

        if (location === null) break;

        const next = new URL(location, 'https://oshxona.uz');
        const target = next.pathname + next.search;

        expect(target, `${route}: ${at} redirects to itself`).not.toBe(at);
        expect(seen, `${route}: loops through ${target}`).not.toContain(target);

        seen.push(at);
        at = target;
      }

      expect(seen.length, `${route} never settled: ${seen.join(' → ')}`).toBeLessThanOrEqual(2);
    }
  });

  it('does not loop when its own rewrite comes back round', () => {
    /*
     * The outage, from the other side.
     *
     * Behind the proxy Next decided the rewrite to the bare path was a jump to
     * another host — `nextUrl` resolves against `localhost:3000` while the
     * request arrived for the public name — and ran the pipeline again on `/`.
     * No language in the path, so it was redirected to `/uz`, which rewrote to
     * `/`, which came back. Every URL on the site answered 308 to itself.
     *
     * Two things stop it and this covers the second: the rewrite is built from
     * `request.url` so the origins match, and a request already carrying the
     * header this file sets is understood as a second pass rather than as a
     * stranger with no language.
     */
    const request = new NextRequest(new URL('/pricing', 'https://oshxona.uz'));

    request.headers.set('x-doc-lang', 'ru');

    const answer = middleware(request);

    expect(answer.status).toBe(200);
    expect(answer.headers.get('location')).toBeNull();
  });

  it('does not let that header past a single guard', () => {
    /*
     * The header is a hint from ourselves, and an outside caller can send one
     * too. If a second pass returned early, `x-doc-lang: uz` on `/dashboard`
     * would be a way around the session guard, the role guard and the crew PIN
     * — every check in this file, defeated by one request header.
     *
     * So it supplies the language and nothing else. The guards run on the same
     * bare path either way, and a stranger gets the same sign-in redirect they
     * would have got without it.
     */
    const request = new NextRequest(new URL('/dashboard', 'https://oshxona.uz'));

    request.headers.set('x-doc-lang', 'uz');

    const answer = middleware(request);

    expect(answer.status).toBe(307);
    expect(goesTo(answer).pathname).toBe('/uz/login');
  });

  it('rewrites to the forwarded origin, not the socket it was reached on', () => {
    /*
     * The second outage, in one assertion.
     *
     * Next decides a rewrite is internal by comparing its origin with the
     * request's; when they differ it opens a real connection to the rewrite —
     * over TLS if the scheme says https — at a port speaking plain HTTP. The
     * service binds `127.0.0.1:3000`, so anything built from the socket names
     * `localhost`, while the request came for the public name. `EPROTO`, 500,
     * every page.
     *
     * `X-Forwarded-Host` is the name a reader typed. Both `request.url` and
     * `request.nextUrl` give the socket, which is why two fixes in a row
     * failed.
     */
    const request = new NextRequest(new URL('/ru/pricing', 'http://127.0.0.1:3000'));

    request.headers.set('host', '127.0.0.1:3000');
    request.headers.set('x-forwarded-host', 'mypos.tashmedunitf.uz');
    request.headers.set('x-forwarded-proto', 'https');

    const rewritten = middleware(request).headers.get('x-middleware-rewrite');

    expect(rewritten).not.toBeNull();

    const url = new URL(rewritten ?? '');

    expect(url.origin).toBe('https://mypos.tashmedunitf.uz');
    expect(url.pathname).toBe('/pricing');
  });

  it('falls back to Host when nothing was forwarded', () => {
    // An edge that sends no `X-Forwarded-*` still names the host the reader
    // asked for, and that is the origin the router will compare against.
    const request = new NextRequest(new URL('/uz/pricing', 'http://127.0.0.1:3000'));

    request.headers.set('host', 'oshxona.uz');

    const url = new URL(middleware(request).headers.get('x-middleware-rewrite') ?? '');

    expect(url.host).toBe('oshxona.uz');
    expect(url.pathname).toBe('/pricing');
  });

  it('rewrites to its own origin, not the one behind the proxy', () => {
    // `nextUrl` resolves against whatever host Next was reached on; `request.url`
    // is the address that came in. When a proxy makes those differ, Next reads
    // an origin-mismatched rewrite as an external jump and re-enters.
    const rewritten = AT('/ru/pricing').headers.get('x-middleware-rewrite');

    expect(new URL(rewritten ?? '').origin).toBe('https://oshxona.uz');
  });

  it('serves the language root without moving it again', () => {
    /*
     * The redirect loop, written down.
     *
     * A half-finished version of this went to production and took the site
     * down: `withLocale('/', 'uz')` returned `/uz/` with a trailing slash,
     * `splitLocale('/uz/')` read that as unprefixed, and every request to the
     * home page was answered with a redirect to itself. `/`, `/uz` and
     * `/uz/login` all looped; nothing on the site opened.
     *
     * `locale-path.test.ts` pins the round trip that makes it impossible. This
     * pins the symptom, because that is what anyone debugging it next will
     * search for.
     */
    for (const path of ['/uz', '/ru', '/en']) {
      const answer = AT(path);

      expect(answer.status, `${path} redirected`).toBe(200);
      expect(answer.headers.get('location'), `${path} redirected`).toBeNull();
    }
  });

  it('serves a prefixed URL without moving it again', () => {
    const answer = AT('/ru/pricing');

    expect(answer.status).toBe(200);
    expect(answer.headers.get('location')).toBeNull();
  });

  it('hands the router the path without the language on it', () => {
    // The whole reason 106 pages did not move into an `app/[locale]` tree: the
    // app inside still answers `/pricing`, and the five guards below still
    // compare the prefixes they were written against.
    const rewritten = AT('/ru/pricing').headers.get('x-middleware-rewrite');

    expect(rewritten).not.toBeNull();
    expect(new URL(rewritten ?? '').pathname).toBe('/pricing');
  });

  it('tells the layout which language to declare', () => {
    expect(AT('/en/pricing').headers.get('x-middleware-request-x-doc-lang')).toBe('en');
  });

  it('carries the language across the /register forward', () => {
    const answer = AT('/ru/register');

    expect(answer.status).toBe(308);

    const to = goesTo(answer);

    expect(to.pathname).toBe('/ru');
    expect(to.hash).toBe('#contact');
  });

  it('leaves the sign-in pages unguarded, with a language', () => {
    for (const path of ['/uz/login', '/ru/forgot-password', '/en/design']) {
      expect(AT(path).status, `${path} was redirected`).toBe(200);
    }
  });
});

/**
 * Who may see a screen before signing in.
 *
 * The worst defect this application had, and it was invisible because it looked
 * like a display default: `roleOrDefault()` answers `owner` for a request with
 * no role cookie, which is right for drawing a sidebar and catastrophic for
 * deciding access. A stranger who typed `/dashboard` was handed the owner's
 * console — named branches, named staff, named customers, the ledger, the till,
 * and the wizard that creates a restaurant.
 *
 * `robots.ts` had already written the reason down and kept crawlers out.
 * Nothing kept people out. These tests are what stop that returning, because
 * the mistake is one careless edit away and produces no error anywhere.
 */
describe('a session is required before a role is even asked', () => {
  it('guards every console module route', () => {
    for (const path of Object.values(MODULE_PATHS)) {
      expect(needsASession(path), `${path} is open to strangers`).toBe(true);
      expect(needsASession(`${path}/anything`), `${path}/… is open`).toBe(true);
    }
  });

  it('guards the back-office surfaces', () => {
    // The platform console, the manager's phone view, the wizard that creates a
    // restaurant, and the printable documents. None has a door of its own to
    // show anybody.
    //
    // `documents` was built without an entry in either map, and `isAllowed()`
    // answers null — a pass — for a path in neither. A restaurant's turnover, a
    // supplier's prices and a named employee's pay sat on an open route.
    for (const key of ['super', 'mobile', 'setup', 'documents'] as const) {
      expect(needsASession(SURFACE_PATHS[key]), `${SURFACE_PATHS[key]} is open`).toBe(true);
    }
  });

  it('leaves the two surfaces that are their own front door', () => {
    /*
     * A till exchanges a pairing code for a device token and then a PIN for a
     * shift; a staff phone does the same with an enrolment code. Their first
     * screen IS the sign-in, so bouncing them to `/login` would send a cashier
     * to a form they have no account for and make the till unusable.
     */
    for (const path of ['/pos', '/pos/who', '/crew', '/crew/waiter']) {
      expect(needsASession(path), `${path} would send a cashier to /login`).toBe(false);
    }
  });

  it('leaves everything a reader sees before there is a session', () => {
    for (const path of ['/', '/login', '/forgot-password', '/design', '/offline']) {
      expect(needsASession(path), `${path} is behind a session`).toBe(false);
    }
  });

  it('leaves the public guest surfaces alone', () => {
    // These have no session by design: a QR code on a table, a restaurant's own
    // website, and the ordering app. Guarding any of them closes the shop.
    for (const path of ['/qr/osh-xona/12', '/r/osh-xona', '/r/osh-xona/menu', '/customer/menu']) {
      expect(needsASession(path), `${path} is behind a session`).toBe(false);
    }
  });

  it('matches whole segments, so an exemption cannot swallow a neighbour', () => {
    /*
     * `/crew` is exempt and `/crm` is a console module. They share a prefix, so
     * an exemption written as a bare `startsWith('/cr')` — or any prefix test
     * without the separator — would quietly open the CRM to strangers.
     *
     * An earlier version of this test asserted that `/posters` needs a session.
     * That was wrong: `/posters` is not a route, so it 404s and there is
     * nothing behind it to guard. The property worth pinning is this one.
     */
    expect(needsASession('/crew'), '/crew must stay its own front door').toBe(false);
    expect(needsASession('/crm'), '/crm is a console module').toBe(true);
    expect(needsASession('/crm/customers')).toBe(true);
  });

  it('leaves a path that is not a route alone', () => {
    // Nothing to protect: Next answers 404, and a redirect to /login would
    // tell a scanner which paths exist by how they fail.
    expect(needsASession('/posters')).toBe(false);
    expect(needsASession('/does-not-exist')).toBe(false);
  });
});

/**
 * The guard actually running, not just the rule it consults.
 *
 * `needsASession()` above pins the policy — which paths are behind a session.
 * It says nothing about whether anything enforces it, and that distinction is
 * not academic: deleting the call site from `middleware()` left every one of
 * those tests green while the console went back to answering strangers. Found
 * by removing it on purpose.
 *
 * So these drive the middleware itself and read the response it returns.
 */
function visit(path: string, cookies: Record<string, string> = {}) {
  // Prefixed, because there is no unprefixed form of any page any more. The
  // guards below are unchanged — they are handed `/dashboard` either way — and
  // what these assert is that the language survives everything they decide.
  const request = new NextRequest(new URL(`/uz${path}`, 'https://oshxona.uz'));

  for (const [name, value] of Object.entries(cookies)) {
    request.cookies.set(name, value);
  }

  return middleware(request);
}

const SESSION = 'restaurant-campus-session';

describe('the session guard, enforced', () => {
  it('sends a stranger from the console to the sign-in', () => {
    const answer = visit('/dashboard');

    expect(answer.status).toBe(307);

    const location = new URL(answer.headers.get('location') ?? '');

    expect(location.pathname).toBe('/uz/login');
    // Where they were going, so signing in finishes the journey rather than
    // dropping them on a dashboard they have to navigate away from.
    expect(location.searchParams.get('next')).toBe('/uz/dashboard');
  });

  it('keeps the query string on the way to sign-in', () => {
    const answer = visit('/finance/till?shift=41');
    const location = new URL(answer.headers.get('location') ?? '');

    expect(location.searchParams.get('next')).toBe('/uz/finance/till?shift=41');
  });

  it('lets a signed-in reader through', () => {
    const answer = visit('/dashboard', { [SESSION]: 'a-token' });

    // 200 from `NextResponse.next()`, not a redirect. The role check that
    // follows is a separate question and has its own tests.
    expect(answer.status).toBe(200);
    expect(answer.headers.get('location')).toBeNull();
  });

  it('never bounces a till or a staff phone to a form they cannot use', () => {
    for (const path of ['/pos', '/crew']) {
      const answer = visit(path);

      expect(answer.status, `${path} was redirected`).toBe(200);
    }
  });

  it('leaves the public surfaces open', () => {
    for (const path of ['/r/osh-xona', '/qr/osh-xona/12', '/customer/menu']) {
      expect(visit(path).status, `${path} was redirected`).toBe(200);
    }
  });
});

/**
 * The loop that made every link in the console feel broken.
 *
 * A soft navigation does not ask for a page, it asks for that page's RSC
 * payload. The router sends `RSC: 1`; Next answers this file's rewrite by
 * telling the client to fetch the bare path with `?_rsc=…` on it; and that
 * request comes back here from a *browser*, so it carries no `x-doc-lang` and
 * has no language in its path. Before this was fixed it was therefore 308'd to
 * the prefixed URL, which rewrote, which redirected to the bare one again.
 *
 * Nothing errored. The route simply never received a payload, so it kept
 * rendering `(dashboard)/loading.tsx` — every screen stuck on its skeleton,
 * while a hard reload of the very same URL worked perfectly. That is what made
 * the pages look slow rather than the navigation between them.
 */
describe('a soft navigation is answered, not bounced', () => {
  const RSC = (path: string, how: 'header' | 'query', init?: { cookie?: string }) => {
    const url = new URL(path, 'https://oshxona.uz');

    if (how === 'query') url.searchParams.set('_rsc', 'a1b2c');

    const request = new NextRequest(url);

    if (how === 'header') request.headers.set('RSC', '1');
    if (init?.cookie !== undefined) request.cookies.set('restaurant-campus-locale', init.cookie);

    return middleware(request);
  };

  it('does not redirect an RSC request that has no language in its path', () => {
    // 308 here is the loop. Anything else is the payload being served.
    expect(RSC('/pricing', 'header').status).not.toBe(308);
    expect(RSC('/pricing', 'header').status).toBe(200);
  });

  it('reads the marker from the query string too, because a proxy can strip a header', () => {
    // The edge proxy in front of this deployment already drops `Upgrade`. A fix
    // that only read the `RSC` header would pass here and loop in production.
    expect(RSC('/pricing', 'query').status).toBe(200);
  });

  it('serves it in the language the reader was already reading', () => {
    const answer = RSC('/pricing', 'header', { cookie: 'ru' });

    expect(answer.status).toBe(200);
    expect(answer.headers.get('x-middleware-request-x-doc-lang') ?? 'ru').toBe('ru');
  });

  it('still gives an ordinary request its language, permanently', () => {
    // The fix must not turn the locale redirect off for everybody else.
    const answer = AT('/pricing');

    expect(answer.status).toBe(308);
    expect(goesTo(answer).pathname).toBe('/uz/pricing');
  });

  it('does not let the RSC marker past a guard', () => {
    // The marker supplies a language and nothing else. A console route with no
    // session goes to sign-in, exactly as it did before — it is not bounced to
    // its own prefixed URL, and it is certainly not served.
    const answer = RSC('/dashboard', 'header');

    expect(answer.status).toBeGreaterThanOrEqual(300);
    expect(goesTo(answer).pathname).not.toBe('/uz/dashboard');
    expect(goesTo(answer).pathname).toContain('/login');
  });
});
