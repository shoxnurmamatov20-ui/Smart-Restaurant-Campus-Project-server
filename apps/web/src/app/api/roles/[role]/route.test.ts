import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';
import { SESSION_COOKIE } from '@/lib/server-session';

/**
 * The one write on this platform that can grant every other one.
 *
 * The assertions are mostly refusals, and that is the point: this handler
 * interpolates a role name into an upstream URL and forwards a list that
 * REPLACES what a role holds. A permission dropped silently on the way through
 * is a role saved with less than the person on screen believed they granted.
 */
function request(body: unknown, signedIn = true) {
  return new NextRequest('http://localhost:3000/api/roles/waiter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signedIn ? { cookie: `${SESSION_COOKIE}=tok_1` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function apiReturns(status: number, payload: unknown) {
  const spy = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(payload), { status }));
  vi.stubGlobal('fetch', spy);

  return spy;
}

const params = (role: string) => ({ params: Promise.resolve({ role }) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/roles/[role]', () => {
  it('sends the whole list as a PUT', async () => {
    const spy = apiReturns(200, { data: [] });

    const response = await POST(
      request({ permissions: ['pos.sell', 'menu.view'] }),
      params('waiter'),
    );

    expect(response.status).toBe(200);
    expect(String(spy.mock.calls[0]?.[0])).toContain('/roles/waiter');
    expect(spy.mock.calls[0]?.[1]?.method).toBe('PUT');
    expect(JSON.parse(String(spy.mock.calls[0]?.[1]?.body))).toEqual({
      permissions: ['pos.sell', 'menu.view'],
    });
  });

  it('leaves the discount ceiling alone unless it was sent', async () => {
    const spy = apiReturns(200, { data: [] });

    await POST(request({ permissions: [] }), params('cashier'));

    // Absent means "do not touch". A console that always sent one would
    // overwrite an owner's 100% with whatever it happened to have rendered.
    expect(JSON.parse(String(spy.mock.calls[0]?.[1]?.body))).not.toHaveProperty(
      'discount_limit_percent',
    );

    await POST(request({ permissions: [], discountLimitPercent: 20 }), params('branch-manager'));

    expect(JSON.parse(String(spy.mock.calls[1]?.[1]?.body))).toHaveProperty(
      'discount_limit_percent',
      20,
    );
  });

  it('refuses a name that is not a permission rather than dropping it', async () => {
    const spy = apiReturns(200, {});

    expect(
      (await POST(request({ permissions: ['pos.sell', 'drop table'] }), params('waiter'))).status,
    ).toBe(400);
    expect((await POST(request({ permissions: 'pos.sell' }), params('waiter'))).status).toBe(400);

    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses a role name that could not be one', async () => {
    const spy = apiReturns(200, {});

    // The segment goes into the upstream URL.
    expect((await POST(request({ permissions: [] }), params('../tenants'))).status).toBe(400);

    expect(spy).not.toHaveBeenCalled();
  });

  it('does not reach the API without a session', async () => {
    const spy = apiReturns(200, {});

    expect((await POST(request({ permissions: [] }, false), params('waiter'))).status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });
});
