import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { SESSION_COOKIE } from '@/lib/server-session';

import { middleware } from './middleware';

/**
 * The guard, tested from the outside.
 *
 * This console shipped with a sign-in form, a TOTP-checked endpoint behind it,
 * a thirty-minute token — and nothing that made anybody use them. The screens
 * were fixtures, so what leaked was the console rather than the data, but the
 * gap was structural: the first screen wired to the API would have turned an
 * open door into an open database.
 *
 * These are the assertions that would have failed then. Negative cases carry
 * the weight — a guard that lets the right person in is obvious the first time
 * somebody signs in; a guard that also lets everybody else in is silent.
 */

const at = (path: string, cookie?: string) => {
  const request = new NextRequest(new URL(`https://console.test${path}`));
  if (cookie !== undefined) request.cookies.set(SESSION_COOKIE, cookie);
  return middleware(request);
};

/** Where a response sends the browser, or `null` when it lets it through. */
const destination = (response: ReturnType<typeof middleware>): string | null => {
  const location = response.headers.get('location');
  return location === null ? null : new URL(location).pathname + new URL(location).search;
};

describe('an operator with no session', () => {
  it('cannot open the tenant list', () => {
    expect(destination(at('/tenants'))).toBe('/login?next=%2Ftenants');
  });

  it('cannot open anything else either', () => {
    // Named individually rather than looped, because each is a screen somebody
    // would have to justify leaving open: keys, backups, the security log, and
    // the list that offers impersonation.
    expect(destination(at('/api-keys'))).toContain('/login');
    expect(destination(at('/backups'))).toContain('/login');
    expect(destination(at('/security'))).toContain('/login');
    expect(destination(at('/team'))).toContain('/login');
    expect(destination(at('/telegram/broadcast'))).toContain('/login');
  });

  it('is sent to the sign-in screen at the root as well', () => {
    // No `next` here: the root is where signing in lands anyway, and a
    // redirect that carries `?next=/` is noise in the address bar.
    expect(destination(at('/'))).toBe('/login');
  });

  it('reaches the sign-in screen itself', () => {
    expect(destination(at('/login'))).toBeNull();
  });

  it('reaches the handler the sign-in screen posts to', () => {
    // Without this the form could not authenticate: the guard would redirect
    // the very request that creates the session.
    expect(destination(at('/api/auth/session'))).toBeNull();
  });
});

describe('an operator holding a session', () => {
  it('is let through', () => {
    expect(destination(at('/tenants', 'a-token'))).toBeNull();
    expect(destination(at('/', 'a-token'))).toBeNull();
  });

  it('is turned away from the sign-in screen', () => {
    // Signing in twice mints a second token and silently ends the session the
    // other tab is using.
    expect(destination(at('/login', 'a-token'))).toBe('/');
  });
});

describe('what the redirect carries', () => {
  it('remembers the path so signing in lands where they were going', () => {
    expect(destination(at('/plans'))).toBe('/login?next=%2Fplans');
  });

  it('drops the query string', () => {
    // A query here can name a tenant. Copying it into a URL that predates the
    // session writes a customer's identity into a log nobody has audited.
    const request = new NextRequest(new URL('https://console.test/tenants?q=osh-xona'));

    expect(destination(middleware(request))).toBe('/login?next=%2Ftenants');
  });
});

/*
 * Not tested here: that the redirect keeps the `/admin` prefix.
 *
 * `basePath` is applied by the Next server, not by `NextRequest` — a bare one
 * constructed in a test reports `basePath: ""` and keeps the prefix in
 * `pathname`, so any assertion written against it would be measuring the test
 * harness rather than the behaviour. What guards it instead is the shape of the
 * code: `middleware.ts` builds its redirects from `request.nextUrl.clone()`,
 * which carries the prefix, rather than from `new URL(path, request.url)`,
 * which resolves against the full incoming address and drops it. The staff
 * console next door uses the second form correctly — it has no basePath.
 */
