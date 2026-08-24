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

      return new Response(JSON.stringify({ data: { id: 2, status: 'pending' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return legs;
}

function request(body: unknown) {
  return new NextRequest('http://localhost:3000/api/staff/shift-swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: `${SESSION_COOKIE}=tok_1` },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/staff/shift-swap', () => {
  it('raises a request against a SHIFT, not a weekday', async () => {
    const legs = upstream();

    const answer = await POST(request({ shiftId: 41, reason: '  shifokorga  ' }));

    expect(answer.status).toBe(200);
    expect(legs[0]?.url).toContain('/staff/shift-swaps');
    expect(legs[0]?.url).not.toContain('approve');
    expect(legs[0]?.body).toEqual({ shift_id: 41, reason: 'shifokorga' });
  });

  it('leaves the taker to the manager, where the API insists on one', async () => {
    const legs = upstream();

    await POST(request({ shiftId: 41 }));

    // Most requests are open — "can anybody take Thursday" — and naming a
    // colleague in the form would make the common case the awkward one.
    expect(legs[0]?.body).not.toHaveProperty('offered_to_id');
    expect(legs[0]?.body.reason).toBeNull();
  });

  it('still decides an existing request when the body names one', async () => {
    const legs = upstream();

    await POST(request({ swapId: 2, verdict: 'approve', takerId: 9 }));

    expect(legs[0]?.url).toContain('/staff/shift-swaps/2/approve');
    expect(legs[0]?.body).toEqual({ offered_to_id: 9, note: null });
  });

  it('refuses a verdict on a fixture row', async () => {
    const legs = upstream();

    expect((await POST(request({ swapId: 's1', verdict: 'approve' }))).status).toBe(400);
    expect(legs).toHaveLength(0);
  });
});
