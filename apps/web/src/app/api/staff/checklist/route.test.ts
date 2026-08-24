import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';
import { SESSION_COOKIE } from '@/lib/server-session';

type Leg = { url: string; body: Record<string, unknown> };

function upstream(): Leg[] {
  const legs: Leg[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      legs.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });

      return new Response(JSON.stringify({ data: [], meta: { done: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return legs;
}

function request(body: unknown) {
  return new NextRequest('http://localhost:3000/api/staff/checklist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: `${SESSION_COOKIE}=tok_1` },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/staff/checklist', () => {
  it('ticks one box on the day that is on screen', async () => {
    const legs = upstream();

    const answer = await POST(request({ day: '2026-08-22', item: 'fridge_temps', done: true }));

    expect(answer.status).toBe(200);
    // The day travels in the path: a bar that closes at two in the morning
    // finishes its opening list after midnight.
    expect(legs[0]?.url).toContain('/staff/opening-checklist/2026-08-22');
    expect(legs[0]?.body).toEqual({ item: 'fridge_temps', done: true });
  });

  it('carries an explicit false rather than a toggle', async () => {
    const legs = upstream();

    await POST(request({ day: '2026-08-22', item: 'fridge_temps', done: false }));

    expect(legs[0]?.body).toEqual({ item: 'fridge_temps', done: false });
  });

  it('refuses a day that is not a date, before it reaches the router', async () => {
    const legs = upstream();

    const answer = await POST(request({ day: 'today', item: 'fridge_temps', done: true }));

    expect(answer.status).toBe(400);
    expect(await answer.json()).toEqual({ error: 'invalid_day' });
    expect(legs).toHaveLength(0);
  });

  it('refuses a missing verdict rather than guessing one', async () => {
    const legs = upstream();

    expect((await POST(request({ day: '2026-08-22', item: 'fridge_temps' }))).status).toBe(400);
    expect(legs).toHaveLength(0);
  });
});
