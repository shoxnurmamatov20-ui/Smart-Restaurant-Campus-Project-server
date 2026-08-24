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

      return new Response(
        JSON.stringify({ data: { id: 9, email: 'ops@example.test' }, password: 'once-only' }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    }),
  );

  return legs;
}

function request(body: unknown, signedIn = true) {
  return new NextRequest('http://localhost:3000/api/platform/team', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signedIn ? { cookie: `${SESSION_COOKIE}=tok_1` } : {}),
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('POST /api/platform/team', () => {
  it('forwards a trimmed name and address and hands the minted password back once', async () => {
    const legs = upstream();

    const answer = await POST(request({ name: ' Dilshod ', email: ' ops@example.test ' }));

    expect(answer.status).toBe(201);
    expect(legs[0]?.url).toContain('/platform/team');
    expect(legs[0]?.body).toEqual({ name: 'Dilshod', email: 'ops@example.test' });
    expect(await answer.json()).toMatchObject({ password: 'once-only' });
  });

  it('refuses half an address before the round trip', async () => {
    const legs = upstream();

    expect((await POST(request({ name: 'Dilshod', email: 'ops@' }))).status).toBe(400);
    expect((await POST(request({ name: 'D', email: 'ops@example.test' }))).status).toBe(400);
    expect(legs).toHaveLength(0);
  });

  it('does not reach the API without a session', async () => {
    const legs = upstream();

    expect(
      (await POST(request({ name: 'Dilshod', email: 'ops@example.test' }, false))).status,
    ).toBe(401);
    expect(legs).toHaveLength(0);
  });
});
