import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';
import { SESSION_COOKIE } from '@/lib/server-session';

type Leg = { url: string; method: string; body: Record<string, unknown> };

function upstream(): Leg[] {
  const legs: Leg[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      legs.push({
        url,
        method: String(init.method),
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
      });

      return new Response(JSON.stringify({ data: { id: 3 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return legs;
}

function request(body: unknown) {
  return new NextRequest('http://localhost:3000/api/tables/layout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: `${SESSION_COOKIE}=tok_1` },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/tables/layout', () => {
  it('patches the one tile it was given', async () => {
    const legs = upstream();

    const answer = await POST(request({ tableId: 3, position: 2 }));

    expect(answer.status).toBe(200);
    expect(legs[0]?.method).toBe('PATCH');
    expect(legs[0]?.url).toContain('/tables/tables/3');
    expect(legs[0]?.body).toEqual({ position: 2 });
  });

  it('accepts zero, which is what an unplaced table is', async () => {
    const legs = upstream();

    // `whole()` refuses zero and would have made "unplaced" unwritable.
    await POST(request({ tableId: 3, position: 0 }));

    expect(legs[0]?.body).toEqual({ position: 0 });
  });

  it('moves a table to another room without touching its number', async () => {
    const legs = upstream();

    await POST(request({ tableId: 3, hallId: 9 }));

    expect(legs[0]?.body).toEqual({ hall_id: 9 });
  });

  it('refuses a write that would change nothing', async () => {
    const legs = upstream();

    const answer = await POST(request({ tableId: 3 }));

    expect(answer.status).toBe(400);
    expect(await answer.json()).toEqual({ error: 'nothing_to_change' });
    expect(legs).toHaveLength(0);
  });

  it('refuses a position past the end of the plan', async () => {
    const legs = upstream();

    expect((await POST(request({ tableId: 3, position: 100_000 }))).status).toBe(400);
    expect(legs).toHaveLength(0);
  });

  it('refuses a fixture row, which carries no primary key', async () => {
    const legs = upstream();

    expect((await POST(request({ tableId: 'A-7', position: 1 }))).status).toBe(400);
    expect(legs).toHaveLength(0);
  });
});
