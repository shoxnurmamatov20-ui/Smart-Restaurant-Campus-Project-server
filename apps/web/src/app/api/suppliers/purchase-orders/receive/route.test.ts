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

      return new Response(JSON.stringify({ data: { id: 8, status: 'received' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return legs;
}

function request(body: unknown) {
  return new NextRequest('http://localhost:3000/api/suppliers/purchase-orders/receive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: `${SESSION_COOKIE}=tok_1` },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/suppliers/purchase-orders/receive', () => {
  it('signs for the whole document when nobody counted', async () => {
    const legs = upstream();

    const answer = await POST(request({ id: 8 }));

    expect(answer.status).toBe(200);
    expect(legs[0]?.url).toContain('/suppliers/purchase-orders/8/receive');
    // An empty `lines` and no `lines` mean the same thing upstream, and sending
    // the key would suggest a count was taken.
    expect(legs[0]?.body).toEqual({});
  });

  it('passes the counts through, zero included', async () => {
    const legs = upstream();

    await POST(
      request({
        id: 8,
        lines: [
          { id: 4, received: 18_000 },
          { id: 5, received: 0 },
        ],
      }),
    );

    // Zero is a real count — a line that did not come at all is exactly what
    // the variance column exists for — and `whole()` would have refused it.
    expect(legs[0]?.body).toEqual({
      lines: [
        { id: 4, received_quantity: 18_000 },
        { id: 5, received_quantity: 0 },
      ],
    });
  });

  it('drops a half-typed count rather than posting a guess', async () => {
    const legs = upstream();

    await POST(
      request({
        id: 8,
        lines: [
          { id: 4, received: 18_000 },
          { id: 5, received: -2 },
          { id: 6, received: 1.5 },
          { received: 9 },
        ],
      }),
    );

    expect(legs[0]?.body).toEqual({ lines: [{ id: 4, received_quantity: 18_000 }] });
  });

  it('refuses a fixture delivery, which is numbered by document rather than by key', async () => {
    const legs = upstream();

    const answer = await POST(request({ id: 'INV-4862' }));

    expect(answer.status).toBe(400);
    expect(await answer.json()).toEqual({ error: 'invalid_purchase_order' });
    expect(legs).toHaveLength(0);
  });
});
