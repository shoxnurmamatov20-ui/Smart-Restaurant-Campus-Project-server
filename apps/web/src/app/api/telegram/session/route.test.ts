import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

type Leg = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function upstream(status = 201, payload: unknown = { token: 'guest_tok' }): Leg[] {
  const legs: Leg[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      legs.push({
        url,
        headers: init.headers as Record<string, string>,
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
      });

      return new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return legs;
}

const request = (body: unknown) =>
  new NextRequest('http://localhost:3000/api/telegram/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  process.env.NEXT_PUBLIC_DEFAULT_TENANT = 'demo-restaurant';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/telegram/session', () => {
  it('exchanges the signature for a customer token', async () => {
    const legs = upstream();

    const answer = await POST(request({ initData: 'auth_date=1&hash=abc' }));

    expect(answer.status).toBe(201);
    expect(await answer.json()).toEqual({ token: 'guest_tok' });
    expect(legs[0]?.url).toContain('/public/telegram/session');
    expect(legs[0]?.headers['X-Tenant']).toBe('demo-restaurant');
    expect(legs[0]?.body).toEqual({ init_data: 'auth_date=1&hash=abc' });
  });

  it('tells the two refusals apart, because they belong to different people', async () => {
    upstream(422, { error: { code: 'telegram.not_configured' } });
    const noBot = await POST(request({ initData: 'x' }));
    expect(await noBot.json()).toEqual({ error: 'telegram.not_configured' });

    vi.unstubAllGlobals();
    upstream(422, { error: { code: 'telegram.invalid_init_data' } });
    const forged = await POST(request({ initData: 'x' }));
    expect(await forged.json()).toEqual({ error: 'telegram.invalid_init_data' });
  });

  it('does not call the API without a signature', async () => {
    const legs = upstream();

    expect((await POST(request({ initData: '' }))).status).toBe(400);
    expect((await POST(request({}))).status).toBe(400);
    expect(legs).toHaveLength(0);
  });
});
