import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';
import { SESSION_COOKIE } from '@/lib/server-session';

function upstream() {
  const legs: { url: string; body: Record<string, unknown> }[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      legs.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });

      return new Response(JSON.stringify({ owner: { password: 'once-only-value' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return legs;
}

function request(body: unknown, signedIn = true) {
  return new NextRequest('http://localhost:3000/api/platform/tenant-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signedIn ? { cookie: `${SESSION_COOKIE}=tok_1` } : {}),
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('POST /api/platform/tenant-password', () => {
  it('sends nothing at all when no password was typed, so one is generated', async () => {
    /*
     * The distinction this test exists for: an empty field has to reach the API
     * as an ABSENT key, not as `""`. The rule upstream is `nullable` with a
     * minimum length, so an empty string is a *chosen* blank and would be
     * refused — and the generator, which is the default this console offers
     * first, would never run.
     */
    const legs = upstream();

    const answer = await POST(request({ tenantId: 12 }));

    expect(answer.status).toBe(200);
    expect(legs[0]?.url).toContain('/platform/tenants/12/owner-password');
    expect(legs[0]?.body).toEqual({});
    expect(await answer.json()).toMatchObject({ owner: { password: 'once-only-value' } });
  });

  it('treats a field of spaces as untyped', async () => {
    const legs = upstream();

    await POST(request({ tenantId: 12, password: '   ' }));

    expect(legs[0]?.body).toEqual({});
  });

  it('forwards a chosen password, trimmed', async () => {
    // A password with a space on the end is one nobody can dictate over a phone,
    // and this is the field it is typed into.
    const legs = upstream();

    await POST(request({ tenantId: 12, password: '  Osh7Xona7Termiz  ' }));

    expect(legs[0]?.body).toEqual({ password: 'Osh7Xona7Termiz' });
  });

  it('refuses a row with no numeric key rather than guessing one', async () => {
    // A guess here would reset the password of whichever restaurant happens to
    // hold that id — somebody else's business, mid-service.
    const legs = upstream();

    expect((await POST(request({}))).status).toBe(400);
    expect((await POST(request({ tenantId: 'demo' }))).status).toBe(400);
    expect(legs).toHaveLength(0);
  });

  it('does not reach the API without a session', async () => {
    const legs = upstream();

    expect((await POST(request({ tenantId: 12 }, false))).status).toBe(401);
    expect(legs).toHaveLength(0);
  });
});
