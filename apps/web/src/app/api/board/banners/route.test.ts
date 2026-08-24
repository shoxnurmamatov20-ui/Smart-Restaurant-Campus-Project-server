import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST, slugFor, slugify } from './route';
import { SESSION_COOKIE } from '@/lib/server-session';

/**
 * Writing a strip onto the wall.
 *
 * Two things are worth a test here and neither is the happy path on its own.
 * The first is the three-language rule: a banner missing one of them must fail
 * with a word the panel can put under the field, not as a 422 nobody unpacks —
 * and it must fail *before* the request, because a half-written promise
 * reaching the wall is the failure this rule exists to prevent.
 *
 * The second is the slug. It is derived rather than typed, so it has to survive
 * text that produces no latin characters at all: a Russian-only sentence would
 * otherwise slug to the empty string and be refused by the column's own regex,
 * which is a failure a manager could do nothing about.
 */
function request(body: unknown, cookies: Record<string, string> = { [SESSION_COOKIE]: 'tok_1' }) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

  return new NextRequest('http://localhost:3000/api/board/banners', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

type Leg = { url: string; body: Record<string, unknown> | null };

function serve(status = 201, payload: unknown = { data: { id: 4 } }) {
  const legs: Leg[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      legs.push({
        url: String(input),
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

const banner = (over: Record<string, unknown> = {}) => ({
  text: { uz: 'Osh -20%', ru: 'Плов -20%', en: 'Pilaf -20%' },
  kind: 'offer',
  ...over,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('slugify', () => {
  it('makes a key out of a sentence a manager typed', () => {
    expect(slugify('Osh -20% — bugun!')).toBe('osh-20-bugun');
  });

  it('never answers the empty string, which the column refuses', () => {
    expect(slugify('Плов со скидкой')).toBe('banner');
    expect(slugify('   ')).toBe('banner');
  });

  it('keeps the key inside the column and never ends on a hyphen', () => {
    const key = slugify('a'.repeat(60));

    expect(key.length).toBeLessThanOrEqual(32);
    expect(key.endsWith('-')).toBe(false);
  });

  it('separates two strips written in different minutes', () => {
    expect(slugFor('Osh', 0)).not.toBe(slugFor('Osh', 3_600_000));
  });
});

describe('POST /api/board/banners', () => {
  it('sends the three languages, the kind and a derived slug', async () => {
    const legs = serve();

    const response = await POST(request(banner()));

    expect(response.status).toBe(201);
    expect(legs).toHaveLength(1);
    expect(legs[0]?.url).toContain('/board/banners');
    expect(legs[0]?.body).toMatchObject({
      text: { uz: 'Osh -20%', ru: 'Плов -20%', en: 'Pilaf -20%' },
      kind: 'offer',
      is_live: false,
    });
    expect(String(legs[0]?.body?.slug)).toMatch(/^osh-20-[a-z0-9]+$/);
  });

  it('leaves a new strip off the wall unless somebody asked for it', async () => {
    const legs = serve();

    await POST(request(banner({ isLive: true })));

    expect(legs[0]?.body).toMatchObject({ is_live: true });
  });

  it('refuses a promise written in only one language', async () => {
    const legs = serve();

    for (const text of [
      { uz: 'Osh', ru: '', en: 'Pilaf' },
      { uz: '', ru: 'Плов', en: 'Pilaf' },
      { uz: 'Osh', ru: 'Плов', en: '   ' },
    ]) {
      const response = await POST(request(banner({ text })));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'text_required' });
    }

    expect(legs).toEqual([]);
  });

  it('refuses a line longer than the wall can hold', async () => {
    const legs = serve();

    const response = await POST(
      request(banner({ text: { uz: 'a'.repeat(121), ru: 'b', en: 'c' } })),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'text_too_long' });
    expect(legs).toEqual([]);
  });

  it('refuses a kind the board has no style for', async () => {
    const legs = serve();

    const response = await POST(request(banner({ kind: 'discount' })));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_kind' });
    expect(legs).toEqual([]);
  });

  it('refuses a window that is not made of dates', async () => {
    const legs = serve();

    const response = await POST(request(banner({ startsAt: 'next friday' })));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_window' });
    expect(legs).toEqual([]);
  });

  it('passes an omitted window through as no window at all', async () => {
    const legs = serve();

    await POST(request(banner({ startsAt: '', endsAt: undefined })));

    expect(legs[0]?.body).toMatchObject({ starts_at: null, ends_at: null });
  });

  it('hands an upstream refusal back with its own status and sentence', async () => {
    serve(422, { error: { code: 'validation.failed', message_uz: 'Bu kalit band' } });

    const response = await POST(request(banner()));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: 'validation.failed' } });
  });

  it('never reaches the API without a session', async () => {
    const legs = serve();

    const response = await POST(request(banner(), {}));

    expect(response.status).toBe(401);
    expect(legs).toEqual([]);
  });
});
