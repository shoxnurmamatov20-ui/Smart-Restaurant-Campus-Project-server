import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

function upstream(): string[] {
  const urls: string[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);

      return new Response(JSON.stringify({ data: { points: 120 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return urls;
}

const request = (path: string, token = 'guest_tok') =>
  new NextRequest(`http://localhost:3000/api/telegram/read?path=${encodeURIComponent(path)}`, {
    headers: token === '' ? {} : { 'X-Tg-Token': token },
  });

afterEach(() => vi.unstubAllGlobals());

describe('GET /api/telegram/read', () => {
  it('carries the guest’s token to an allowed path', async () => {
    const urls = upstream();

    const answer = await GET(request('/public/me'));

    expect(answer.status).toBe(200);
    expect(urls[0]).toContain('/public/me');
  });

  it('refuses a path that is not on the list — a token is not a passkey', async () => {
    const urls = upstream();

    expect((await GET(request('/platform/tenants'))).status).toBe(400);
    expect((await GET(request('/public/me/../../platform'))).status).toBe(400);
    expect(urls).toHaveLength(0);
  });

  it('refuses without a token', async () => {
    const urls = upstream();

    expect((await GET(request('/public/me', ''))).status).toBe(401);
    expect(urls).toHaveLength(0);
  });
});
