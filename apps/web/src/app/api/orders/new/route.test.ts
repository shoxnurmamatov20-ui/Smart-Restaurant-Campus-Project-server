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

      return new Response(JSON.stringify({ data: { id: 1, number: 'A-1291' } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return legs;
}

function request(body: unknown) {
  return new NextRequest('http://localhost:3000/api/orders/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: `${SESSION_COOKIE}=tok_1` },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/orders/new', () => {
  it('opens a dine-in bill against a table', async () => {
    const legs = upstream();

    const answer = await POST(
      request({ channel: 'dine_in', tableId: 12, guests: 4, intakeChannel: null }),
    );

    expect(answer.status).toBe(201);
    expect(legs[0]?.url).toContain('/orders/orders');
    expect(legs[0]?.body).toMatchObject({
      channel: 'dine_in',
      restaurant_table_id: 12,
      guests_count: 4,
      intake_channel: null,
      // Which SOFTWARE posted it, which is not which conversation it was.
      source: 'pos',
    });
  });

  it('never sends a basket — the dishes are the terminal’s job', async () => {
    const legs = upstream();

    await POST(request({ channel: 'takeaway', customerPhone: '+998901234567' }));

    expect(legs[0]?.body).not.toHaveProperty('items');
  });

  it('refuses a delivery with no address before the round trip', async () => {
    const legs = upstream();

    const answer = await POST(request({ channel: 'delivery', customerPhone: '+998901234567' }));

    expect(answer.status).toBe(400);
    expect(await answer.json()).toEqual({ error: 'address_required' });
    expect(legs).toHaveLength(0);
  });

  it('refuses a channel the order table has no column for', async () => {
    const legs = upstream();

    expect((await POST(request({ channel: 'carrier-pigeon' }))).status).toBe(400);
    expect(legs).toHaveLength(0);
  });

  it('refuses an intake channel that is not one of the six', async () => {
    const legs = upstream();

    expect(
      (await POST(request({ channel: 'delivery', address: 'X', intakeChannel: 'fax' }))).status,
    ).toBe(400);
    expect(legs).toHaveLength(0);
  });

  it('sends null rather than an empty string for what nobody typed', async () => {
    const legs = upstream();

    await POST(request({ channel: 'takeaway', customerName: '   ', note: '' }));

    expect(legs[0]?.body.customer_name).toBeNull();
    expect(legs[0]?.body.note).toBeNull();
    expect(legs[0]?.body.customer_phone).toBeNull();
  });
});
