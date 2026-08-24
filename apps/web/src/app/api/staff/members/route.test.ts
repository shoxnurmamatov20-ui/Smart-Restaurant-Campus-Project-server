import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';
import { SESSION_COOKIE } from '@/lib/server-session';

type Leg = { url: string; body: Record<string, unknown> };

function upstream(status = 201): Leg[] {
  const legs: Leg[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      legs.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });

      return new Response(JSON.stringify({ data: { id: 7, employee_code: 'EMP-0001' } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return legs;
}

function request(body: unknown, signedIn = true) {
  return new NextRequest('http://localhost:3000/api/staff/members', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signedIn ? { cookie: `${SESSION_COOKIE}=tok_1` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const hire = {
  firstName: 'Dilnoza',
  lastName: 'Yusupova',
  position: 'waiter',
  phone: ' +998901234567 ',
  branchId: '3',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/staff/members', () => {
  it('sends the API the shape it validates, trimmed', async () => {
    const legs = upstream();

    const answer = await POST(request(hire));

    expect(answer.status).toBe(201);
    expect(legs[0]?.url).toContain('/staff/members');
    expect(legs[0]?.body).toEqual({
      first_name: 'Dilnoza',
      last_name: 'Yusupova',
      position: 'waiter',
      phone: '+998901234567',
      branch_id: 3,
    });
    // Not invented here: the code is allocated upstream, off the counter.
    expect(legs[0]?.body).not.toHaveProperty('employee_code');
  });

  it('leaves the venue null for a restaurant that has not been asked', async () => {
    const legs = upstream();

    await POST(request({ ...hire, branchId: undefined, phone: '' }));

    expect(legs[0]?.body.branch_id).toBeNull();
    expect(legs[0]?.body.phone).toBeNull();
  });

  it('refuses a job the rota does not know, before the round trip', async () => {
    const legs = upstream();

    const answer = await POST(request({ ...hire, position: 'astronaut' }));

    expect(answer.status).toBe(400);
    expect(await answer.json()).toMatchObject({ error: 'invalid_position' });
    expect(legs).toHaveLength(0);
  });

  it('refuses half a name', async () => {
    const legs = upstream();

    expect((await POST(request({ ...hire, firstName: 'D' }))).status).toBe(400);
    expect((await POST(request({ ...hire, lastName: '' }))).status).toBe(400);
    expect(legs).toHaveLength(0);
  });

  it('does not reach the API without a session', async () => {
    const legs = upstream();

    expect((await POST(request(hire, false))).status).toBe(401);
    expect(legs).toHaveLength(0);
  });
});
