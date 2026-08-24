import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';
import { SESSION_COOKIE } from '@/lib/server-session';

/**
 * Reading back the password the platform issued.
 *
 * This handler carries a credential in plain text, so what it must never do is
 * as important as what it does: no tenant id means no request at all, and no
 * session means the same. Both are asserted by counting the upstream calls
 * rather than by reading the status, because a handler that answers 400 *after*
 * asking has already leaked.
 */

function upstream(answer: unknown, status = 200) {
  const calls: string[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);

      return new Response(JSON.stringify(answer), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return calls;
}

function request(query: string, signedIn = true) {
  return new NextRequest(`http://localhost:3000/api/platform/tenant-password/reveal${query}`, {
    headers: signedIn ? { cookie: `${SESSION_COOKIE}=tok_1` } : {},
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('GET /api/platform/tenant-password/reveal', () => {
  it('asks the platform for that one restaurant and hands back what it says', async () => {
    const calls = upstream({
      owner: { email: 'egasi@oshxona.uz', password: 'Osh7Xona7Termiz', issued_at: '2026-08-24' },
    });

    const answer = await GET(request('?tenantId=42'));

    expect(answer.status).toBe(200);
    expect(calls[0]).toContain('/platform/tenants/42/owner-password');
    expect(await answer.json()).toMatchObject({
      owner: { password: 'Osh7Xona7Termiz', issued_at: '2026-08-24' },
    });
  });

  it('passes a null password through rather than turning it into an error', async () => {
    /*
     * `null` is the answer when the owner has changed their password since, and
     * it is a *fact* rather than a failure. A handler that treated it as one
     * would leave the panel unable to tell "we could not ask" apart from "there
     * is nothing stored", and those need different sentences.
     */
    upstream({ owner: { email: 'egasi@oshxona.uz', password: null, issued_at: null } });

    const answer = await GET(request('?tenantId=42'));

    expect(answer.status).toBe(200);
    expect(await answer.json()).toMatchObject({ owner: { password: null } });
  });

  it('does not ask at all without a numeric tenant', async () => {
    // A fixture row carries no key, and a guess would read out the credentials
    // of whichever restaurant happens to hold that number.
    const calls = upstream({});

    expect((await GET(request(''))).status).toBe(400);
    expect((await GET(request('?tenantId=demo'))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('does not ask at all without a session', async () => {
    const calls = upstream({});

    expect((await GET(request('?tenantId=42', false))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('reports a refusal upstream rather than drawing a blank credential', async () => {
    // 403 from the API — an operator whose role was changed mid-session. The
    // panel has to say it could not ask, not show an empty box where a password
    // belongs.
    upstream({}, 403);

    expect((await GET(request('?tenantId=42'))).status).toBe(400);
  });
});
