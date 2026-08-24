import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';
import { SESSION_COOKIE } from '@/lib/server-session';

/**
 * Moving a booking to another hour.
 *
 * Two rules are load-bearing. A move with no table named must not clear the
 * table a booking already holds — "move it to 20:30" is not "unseat them" — so
 * the key is absent rather than null. And a time that is not a time must be
 * refused here: `starts_at` is validated upstream, and a diary that posted
 * `20:3` would show the host a validation error about a field they cannot see.
 */
function request(body: unknown, cookies: Record<string, string> = { [SESSION_COOKIE]: 'tok_1' }) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

  return new NextRequest('http://localhost:3000/api/tables/reservations/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

type Leg = { url: string; method: string; body: Record<string, unknown> | null };

function serve(status = 200, payload: unknown = { data: { id: 9 } }) {
  const legs: Leg[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      legs.push({
        url: String(input),
        method: init?.method ?? 'GET',
        body:
          typeof init?.body === 'string'
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : null,
      });

      return new Response(JSON.stringify(payload), { status });
    }),
  );

  return legs;
}

const at = '2026-08-22T20:30:00.000Z';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/tables/reservations/move', () => {
  it('patches the booking with the new time', async () => {
    const legs = serve();

    const response = await POST(request({ id: 9, startsAt: at }));

    expect(response.status).toBe(200);
    expect(legs[0]?.method).toBe('PATCH');
    expect(legs[0]?.url).toContain('/tables/reservations/9');
    expect(legs[0]?.body).toEqual({ starts_at: at });
  });

  it('leaves the table alone when the move did not name one', async () => {
    const legs = serve();

    await POST(request({ id: 9, startsAt: at, tableId: null }));

    expect(Object.keys(legs[0]?.body ?? {})).toEqual(['starts_at']);
  });

  it('sends the table when one was chosen', async () => {
    const legs = serve();

    await POST(request({ id: 9, startsAt: at, tableId: 4 }));

    expect(legs[0]?.body).toMatchObject({ restaurant_table_id: 4 });
  });

  it('refuses a time that is not one', async () => {
    const legs = serve();

    for (const startsAt of ['', '20:3', 'tonight', 42, null]) {
      const response = await POST(request({ id: 9, startsAt }));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_time' });
    }

    expect(legs).toEqual([]);
  });

  it('never sends a fixture row at the API', async () => {
    const legs = serve();

    const response = await POST(request({ id: 'b0', startsAt: at }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_reservation' });
    expect(legs).toEqual([]);
  });

  it('never reaches the API without a session', async () => {
    const legs = serve();

    const response = await POST(request({ id: 9, startsAt: at }, {}));

    expect(response.status).toBe(401);
    expect(legs).toEqual([]);
  });
});
