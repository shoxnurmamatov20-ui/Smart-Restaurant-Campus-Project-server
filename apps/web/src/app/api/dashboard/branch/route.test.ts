import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';
import { BRANCH_COOKIE } from '@/lib/branch-cookie';
import { SESSION_COOKIE } from '@/lib/server-session';

/**
 * Choosing a venue writes a cookie that becomes `X-Branch` on every request the
 * console makes. That is why almost every test below is about REFUSING to
 * write it: a slug the API does not know answers 404 on every screen at once,
 * from a cookie the reader cannot see and did not know they had.
 */
type Leg = { url: string };

function upstream(context: Record<string, unknown>, branches: unknown[]): Leg[] {
  const legs: Leg[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      legs.push({ url });

      const body = String(url).includes('/auth/context') ? context : { data: branches };

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return legs;
}

function request(body: unknown, signedIn = true) {
  return new NextRequest('http://localhost:3000/api/dashboard/branch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signedIn ? { cookie: `${SESSION_COOKIE}=tok_1` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const REGISTER = [
  { id: 1, name: 'Chilonzor', slug: 'chilonzor', status: 'active' },
  { id: 2, name: 'Yunusobod', slug: 'yunusobod', status: 'active' },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/dashboard/branch', () => {
  it('writes the slug when it is one of the restaurant’s own venues', async () => {
    upstream({ branch_pinned: false }, REGISTER);

    const answer = await POST(request({ slug: 'yunusobod' }));

    expect(answer.status).toBe(200);
    expect(answer.cookies.get(BRANCH_COOKIE)?.value).toBe('yunusobod');
    // Nothing in the browser reads this, and the one thing a script could do
    // with it is set a slug that was never checked.
    expect(answer.cookies.get(BRANCH_COOKIE)?.httpOnly).toBe(true);
  });

  it('clears the cookie for the roll-up, which is a state and not a mistake', async () => {
    upstream({ branch_pinned: false }, REGISTER);

    const answer = await POST(request({ slug: null }));

    expect(answer.status).toBe(200);
    // A deleted cookie is written back with no value and no life left.
    expect(answer.cookies.get(BRANCH_COOKIE)?.value).toBe('');
  });

  it('refuses a slug this restaurant does not have', async () => {
    upstream({ branch_pinned: false }, REGISTER);

    const answer = await POST(request({ slug: 'somebody-elses-venue' }));

    expect(answer.status).toBe(404);
    expect(answer.cookies.get(BRANCH_COOKIE)).toBeUndefined();
  });

  it('refuses a pinned reader, who has no choice to make', async () => {
    // ResolveBranch answers `branch.mismatch` to them on every request, so
    // writing the cookie would double the traffic to reach the same page.
    upstream({ branch_pinned: true }, REGISTER);

    const answer = await POST(request({ slug: 'yunusobod' }));

    expect(answer.status).toBe(409);
    expect(answer.cookies.get(BRANCH_COOKIE)).toBeUndefined();
  });

  it('refuses when it cannot check, rather than trusting the browser', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );

    const answer = await POST(request({ slug: 'yunusobod' }));

    expect(answer.status).toBe(401);
    expect(answer.cookies.get(BRANCH_COOKIE)).toBeUndefined();
  });

  it('never asks the register before it knows the reader may choose', async () => {
    const legs = upstream({ branch_pinned: true }, REGISTER);

    await POST(request({ slug: 'yunusobod' }));

    expect(legs.map((leg) => leg.url).filter((url) => url.includes('/branches'))).toEqual([]);
  });
});
