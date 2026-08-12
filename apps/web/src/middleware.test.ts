import { describe, expect, it } from 'vitest';

import { config } from './middleware';
import { MODULE_PATHS } from './lib/roles';

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

  it('stays off the pages a reader sees before there is a session', () => {
    // `/` is the marketing site, and the two forms are how someone gets a
    // session in the first place. Guarding any of them is a redirect loop.
    for (const path of ['/', '/login', '/forgot-password', '/design']) {
      expect(runsOn(path), `${path} would be guarded`).toBe(false);
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
