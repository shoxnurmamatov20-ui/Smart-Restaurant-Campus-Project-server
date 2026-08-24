import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';
import { SESSION_COOKIE } from '@/lib/server-session';

type Leg = { url: string; method: string; body: Record<string, unknown> };

function upstream(status = 200): Leg[] {
  const legs: Leg[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      legs.push({
        url,
        method: String(init.method),
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
      });

      return new Response(JSON.stringify({ data: { prep_minutes: 40 } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return legs;
}

function request(body: unknown) {
  return new NextRequest('http://localhost:3000/api/orders/intake-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: `${SESSION_COOKIE}=tok_1` },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/orders/intake-rules', () => {
  it('translates a switch into the column the table holds', async () => {
    const legs = upstream();

    const answer = await POST(request({ rule: 'cap', on: false }));

    expect(answer.status).toBe(200);
    expect(legs[0]?.method).toBe('PUT');
    expect(legs[0]?.url).toContain('/orders/intake-rules');
    expect(legs[0]?.body).toEqual({ pause_at_peak: false });
  });

  it('sends the prep time alone, so one card does not rewrite another', async () => {
    const legs = upstream();

    await POST(request({ prepMinutes: 40 }));

    expect(legs[0]?.body).toEqual({ prep_minutes: 40 });
  });

  it('refuses a rule this screen does not draw, before the round trip', async () => {
    const legs = upstream();

    const answer = await POST(request({ rule: 'auto_accept_everything', on: true }));

    expect(answer.status).toBe(400);
    expect(legs).toEqual([]);
  });

  it('refuses a switch with no position', async () => {
    const legs = upstream();

    expect((await POST(request({ rule: 'auto' }))).status).toBe(400);
    expect(legs).toEqual([]);
  });

  it('refuses a prep time that is not a whole number of minutes', async () => {
    const legs = upstream();

    expect((await POST(request({ prepMinutes: 22.5 }))).status).toBe(400);
    expect((await POST(request({ prepMinutes: '40' }))).status).toBe(400);
    expect(legs).toEqual([]);
  });

  it('refuses an empty body rather than reporting a save with no subject', async () => {
    const legs = upstream();

    expect((await POST(request({}))).status).toBe(400);
    expect(legs).toEqual([]);
  });
});
