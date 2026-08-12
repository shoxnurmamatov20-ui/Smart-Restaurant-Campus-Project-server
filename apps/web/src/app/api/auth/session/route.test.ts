import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { DELETE, POST } from './route';
import { ROLE_COOKIE } from '@/lib/role-cookie';
import { SESSION_COOKIE } from '@/lib/server-session';

/**
 * Signing in, without an API behind it.
 *
 * `fetch` is stubbed, so what is under test is this handler's own judgement:
 * which cookies it sets, which refusals it distinguishes, and what it hands
 * back for the browser to navigate to.
 *
 * The test that matters most is the boring one — that a successful sign-in
 * sets **both** cookies. It did not, once. The token cookie alone left
 * middleware.ts reading a role cookie that was not there, `roleOrDefault`
 * returned the owner, and a signed-in waiter could open /finance. Everything
 * looked right: they were signed in, their own name was in the corner, their
 * sidebar had two rows. Only the URL bar disagreed.
 */
function request(body: unknown, cookies: Record<string, string> = {}) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

  // NextRequest rather than Request: `.cookies` is Next's own addition, and
  // DELETE reads the token off it.
  return new NextRequest('http://localhost:3000/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

/** What Laravel answers with, narrowed to the fields the handler reads. */
function apiReturns(status: number, payload: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(payload), { status })),
  );
}

const cookiesOf = (response: Response) => response.headers.getSetCookie().join('\n');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/auth/session', () => {
  it('sets the token and the role together', async () => {
    apiReturns(200, { token: 'tok_1', user: { name: 'Dilnoza', roles: ['waiter'] } });

    const response = await POST(request({ email: 'waiter@demo.uz', password: 'password' }));
    const jar = cookiesOf(response);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ role: 'waiter', redirect: '/dashboard' });

    // The token, unreadable from the page.
    expect(jar).toContain(`${SESSION_COOKIE}=tok_1`);
    expect(jar).toMatch(new RegExp(`${SESSION_COOKIE}=[^;]*;[^\\n]*HttpOnly`, 'i'));

    // The role, readable by middleware.ts — which is the whole point of it.
    expect(jar).toContain(`${ROLE_COOKIE}=waiter`);
    expect(jar).not.toMatch(new RegExp(`${ROLE_COOKIE}=[^;]*;[^\\n]*HttpOnly`, 'i'));
  });

  it('sends each role to the screen its role lands on', async () => {
    const cases = [
      [['chef'], 'kitchen', '/kitchen'],
      [['super-admin'], 'super', '/platform'],
      [['branch-manager'], 'manager', '/dashboard'],
      [['storekeeper'], 'warehouse', '/dashboard'],
    ] as const;

    for (const [roles, id, redirect] of cases) {
      apiReturns(200, { token: 't', user: { name: 'X', roles } });

      const response = await POST(request({ email: 'a@b.uz', password: 'p' }));

      expect(await response.json(), `${roles[0]} lands wrong`).toEqual({ role: id, redirect });
    }
  });

  it('refuses an account with no console and sets nothing', async () => {
    // A marketer and a cook are real accounts with real permissions that the
    // design draws no screen for. Signing them into the owner's dashboard
    // because it sorts first would be a permission bug wearing a convenience.
    apiReturns(200, { token: 't', user: { name: 'Jasur', roles: ['marketer'] } });

    const response = await POST(request({ email: 'marketer@demo.uz', password: 'password' }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'no_surface' });
    expect(cookiesOf(response)).not.toContain(SESSION_COOKIE);
  });

  it('tells a wrong password apart from an API that is not there', async () => {
    // One says "check what you typed", the other says "try again in a minute".
    // Collapsing them is how someone retypes a correct password all afternoon.
    apiReturns(401, { message: "Login yoki parol noto'g'ri." });

    const rejected = await POST(request({ email: 'a@b.uz', password: 'wrong' }));
    expect(rejected.status).toBe(401);
    expect(await rejected.json()).toMatchObject({ error: 'rejected' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const down = await POST(request({ email: 'a@b.uz', password: 'password' }));
    expect(down.status).toBe(502);
    expect(await down.json()).toEqual({ error: 'api_unreachable' });
  });

  it('will not call the API with an empty field', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);

    const response = await POST(request({ email: '', password: 'password' }));

    expect(response.status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/auth/session', () => {
  it('clears both cookies even when the API refuses to answer', async () => {
    // A token the server still honours and nobody holds is a nuisance. A
    // browser that stays signed in because logout failed is a breach.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const response = await DELETE(
      request({}, { [SESSION_COOKIE]: 'tok_1', [ROLE_COOKIE]: 'waiter' }),
    );
    const jar = cookiesOf(response);

    expect(response.status).toBe(200);
    // A deletion is an empty value with an expiry in the past.
    expect(jar).toContain(`${SESSION_COOKIE}=;`);
    expect(jar).toContain(`${ROLE_COOKIE}=;`);
  });
});
