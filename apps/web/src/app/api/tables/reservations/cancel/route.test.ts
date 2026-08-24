import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';
import { SESSION_COOKIE } from '@/lib/server-session';

/**
 * Calling a booking off, for real.
 *
 * The thing worth asserting is the refusal path: a fixture row's key is a word
 * (`b0`, `b1`) and it must never reach the API, because the failure would come
 * back as a 404 the diary would show the host as "could not cancel" — over a
 * row that was never a booking in the first place.
 */
function request(body: unknown, cookies: Record<string, string> = { [SESSION_COOKIE]: 'tok_1' }) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

  return new NextRequest('http://localhost:3000/api/tables/reservations/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

type Leg = { url: string; method: string };

function serve(status = 200, payload: unknown = { data: { id: 9, status: 'cancelled' } }) {
  const legs: Leg[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      legs.push({ url: String(input), method: init?.method ?? 'GET' });

      return new Response(JSON.stringify(payload), { status });
    }),
  );

  return legs;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/tables/reservations/cancel', () => {
  it('calls the endpoint that releases the table', async () => {
    const legs = serve();

    const response = await POST(request({ id: 9 }));

    expect(response.status).toBe(200);
    expect(legs).toHaveLength(1);
    expect(legs[0]?.method).toBe('POST');
    expect(legs[0]?.url).toContain('/tables/reservations/9/cancel');
  });

  it('never sends a fixture row at the API', async () => {
    const legs = serve();

    for (const id of ['b0', 0, -3, 1.5, null]) {
      const response = await POST(request({ id }));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_reservation' });
    }

    expect(legs).toEqual([]);
  });

  it('hands an upstream refusal back with its own status', async () => {
    serve(403, { error: { code: 'auth.forbidden', message_uz: 'Ruxsat yo‘q' } });

    const response = await POST(request({ id: 9 }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'auth.forbidden' } });
  });

  it('never reaches the API without a session', async () => {
    const legs = serve();

    const response = await POST(request({ id: 9 }, {}));

    expect(response.status).toBe(401);
    expect(legs).toEqual([]);
  });
});
