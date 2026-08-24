import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';
import { SESSION_COOKIE } from '@/lib/server-session';

function upstream() {
  const legs: { url: string; method: string; body: Record<string, unknown> }[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      legs.push({
        url,
        method: String(init.method),
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
      });

      return new Response(JSON.stringify({ owner: { id: 4, email: 'egasi@oshxona.uz' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return legs;
}

function request(body: unknown, signedIn = true) {
  return new NextRequest('http://localhost:3000/api/platform/tenant-owner', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signedIn ? { cookie: `${SESSION_COOKIE}=tok_1` } : {}),
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('POST /api/platform/tenant-owner', () => {
  it('PATCHes the tenant it was given, with the address trimmed', async () => {
    const legs = upstream();

    const answer = await POST(request({ tenantId: 12, email: '  egasi@oshxona.uz  ' }));

    expect(answer.status).toBe(200);
    expect(legs[0]?.url).toContain('/platform/tenants/12/owner');
    // POST at the browser, PATCH upstream — the same shape ../tenant uses.
    expect(legs[0]?.method).toBe('PATCH');
    expect(legs[0]?.body).toEqual({ email: 'egasi@oshxona.uz' });
  });

  it('sends only the fields the form actually filled in', async () => {
    /*
     * `sometimes` upstream means an absent key is "leave it alone". Sending the
     * whole form every time would clear a phone number nobody asked to clear —
     * the operator opened the panel to fix an address.
     */
    const legs = upstream();

    await POST(request({ tenantId: 12, email: 'egasi@oshxona.uz', name: '', phone: undefined }));

    expect(legs[0]?.body).toEqual({ email: 'egasi@oshxona.uz' });
  });

  it('forwards a deliberately emptied phone as null rather than dropping it', async () => {
    // Clearing a wrong number is a thing an operator has to be able to do, and
    // "" and absent are different intentions.
    const legs = upstream();

    await POST(request({ tenantId: 12, phone: '   ' }));

    expect(legs[0]?.body).toEqual({ phone: null });
  });

  it('refuses a row with no numeric key rather than guessing one', async () => {
    // A fixture row carries no tenant id, and a guess would edit the owner of
    // whichever restaurant happens to hold that number.
    const legs = upstream();

    expect((await POST(request({ email: 'egasi@oshxona.uz' }))).status).toBe(400);
    expect((await POST(request({ tenantId: 'demo', email: 'egasi@oshxona.uz' }))).status).toBe(400);
    expect(legs).toHaveLength(0);
  });

  it('refuses a request that would change nothing', async () => {
    // The API would answer 200 having done nothing, and the console would report
    // success for a form nobody filled in.
    const legs = upstream();

    expect((await POST(request({ tenantId: 12 }))).status).toBe(400);
    expect(legs).toHaveLength(0);
  });

  it('does not reach the API without a session', async () => {
    const legs = upstream();

    expect((await POST(request({ tenantId: 12, email: 'a@b.uz' }, false))).status).toBe(401);
    expect(legs).toHaveLength(0);
  });
});
