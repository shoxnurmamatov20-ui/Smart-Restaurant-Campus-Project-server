import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { GET, POST } from './route';
import { SESSION_COOKIE } from '@/lib/server-session';

/**
 * A restaurant's whole archive, without an API behind it.
 *
 * The guard is the test that matters. This console draws fixtures whenever the
 * API is unreachable, and those rows carry no numeric key — an export aimed at
 * a guessed id would hand one customer's entire history to an operator looking
 * at a different card, on the strongest credential the platform issues.
 *
 * The rest is about the 202 and the link. Accepted is not done, so the answer
 * goes back with its own status rather than being smoothed into a 200; and the
 * signed URL is passed through untouched, because it IS the credential and a
 * console that re-served it would be holding somebody's archive in its memory
 * for no reason.
 */
function post(body: unknown, cookies: Record<string, string> = { [SESSION_COOKIE]: 'tok_1' }) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

  return new NextRequest('http://localhost:3000/api/platform/tenant-export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function get(query: string, cookies: Record<string, string> = { [SESSION_COOKIE]: 'tok_1' }) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

  return new NextRequest(`http://localhost:3000/api/platform/tenant-export${query}`, {
    headers: cookie ? { cookie } : {},
  });
}

function apiReturns(status: number, payload: unknown) {
  const spy = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(payload), { status }));
  vi.stubGlobal('fetch', spy);

  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/platform/tenant-export', () => {
  it('keeps the 202 rather than answering as though it were done', async () => {
    const spy = apiReturns(202, { data: { id: 9, state: 'queued' } });

    const response = await POST(post({ tenantId: 4 }));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ data: { id: 9, state: 'queued' } });
    expect(String(spy.mock.calls[0]?.[0])).toContain('/platform/tenants/4/export');
    expect(spy.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('refuses a fixture row before it can start somebody else’s export', async () => {
    const spy = apiReturns(202, {});

    const missing = await POST(post({}));
    const slug = await POST(post({ tenantId: 'osh-xona' }));

    expect(await missing.json()).toEqual({ error: 'invalid_tenant' });
    expect(slug.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('answers 401 without a session rather than asking upstream', async () => {
    const spy = apiReturns(202, {});

    const response = await POST(post({ tenantId: 4 }, {}));

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('GET /api/platform/tenant-export', () => {
  it('passes the signed link back exactly as it came', async () => {
    apiReturns(200, {
      data: [
        {
          id: 9,
          state: 'ready',
          url: 'https://api.example.uz/exports/9?signature=abc&expires=1',
          expires_at: '2026-08-23T10:00:00Z',
        },
      ],
    });

    const response = await GET(get('?tenantId=4'));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: [{ url: 'https://api.example.uz/exports/9?signature=abc&expires=1' }],
    });
  });

  it('refuses a listing with no tenant behind it', async () => {
    const spy = apiReturns(200, {});

    expect((await GET(get(''))).status).toBe(400);
    expect((await GET(get('?tenantId=abc'))).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('answers 401 without a session', async () => {
    const spy = apiReturns(200, {});

    const response = await GET(get('?tenantId=4', {}));

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });
});
