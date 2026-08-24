import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';
import { SESSION_COOKIE } from '@/lib/server-session';

type Leg = { url: string; body: string | null };

function upstream(): Leg[] {
  const legs: Leg[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      legs.push({ url, body: init.body === undefined ? null : String(init.body) });

      return new Response(
        JSON.stringify({ data: { categories_created: 8, items_created: 68, skipped: 0 } }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    }),
  );

  return legs;
}

function request(signedIn = true) {
  return new NextRequest('http://localhost:3000/api/menu/seed-template', {
    method: 'POST',
    headers: signedIn ? { cookie: `${SESSION_COOKIE}=tok_1` } : {},
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/menu/seed-template', () => {
  it('asks the server for the catalogue and sends nothing of its own', async () => {
    const legs = upstream();

    const answer = await POST(request());

    expect(answer.status).toBe(201);
    expect(legs[0]?.url).toContain('/menu/seed-template');
    // A console that could name a subset would be a console deciding what a
    // restaurant starts with.
    expect(legs[0]?.body).toBeNull();
    expect(await answer.json()).toMatchObject({ data: { items_created: 68 } });
  });

  it('refuses without a session rather than posting anonymously', async () => {
    const legs = upstream();

    expect((await POST(request(false))).status).toBe(401);
    expect(legs).toHaveLength(0);
  });
});
