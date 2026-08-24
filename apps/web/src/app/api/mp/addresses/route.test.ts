import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';
import { MP_SESSION_COOKIE } from '@/lib/mp-cookie';

/**
 * Adding one address to a book the API replaces wholesale.
 *
 * The property this exists for: the existing rows go back up untouched. The
 * sheet that raises this handler draws a FIXTURE address list, so a design that
 * let the browser send "what I am showing plus the new one" would replace a
 * real address book with two sample addresses the first time somebody added a
 * third. And when the book cannot be read, nothing is written at all — a
 * write-over-an-unread-list is how a home address disappears because the API
 * blinked.
 */
function request(body: unknown, signedIn = true) {
  return new NextRequest('http://localhost:3000/api/mp/addresses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signedIn ? { cookie: `${MP_SESSION_COOKIE}=mp_1` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const stored = (rows: unknown[]) => ({ data: { addresses: rows } });

const home = {
  label: 'Uy',
  address: 'Chilonzor 24',
  note: null,
  latitude: 41.2,
  longitude: 69.2,
  is_default: true,
};

/** GET /mp/me first, PUT /mp/me/addresses second. */
function apiAnswers(read: { status: number; body: unknown }, writeStatus = 200) {
  let call = 0;

  const spy = vi.fn<typeof fetch>(async () => {
    call += 1;

    return call === 1
      ? new Response(JSON.stringify(read.body), { status: read.status })
      : new Response(JSON.stringify({ data: {} }), { status: writeStatus });
  });

  vi.stubGlobal('fetch', spy);

  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/mp/addresses', () => {
  it('sends the stored rows back with the new one appended', async () => {
    const spy = apiAnswers({ status: 200, body: stored([home]) });

    const response = await POST(request({ address: 'Amir Temur 108, 4-qavat' }));

    expect(response.status).toBe(200);
    expect(String(spy.mock.calls[0]?.[0])).toContain('/mp/me');
    expect(String(spy.mock.calls[1]?.[0])).toContain('/mp/me/addresses');
    expect(spy.mock.calls[1]?.[1]?.method).toBe('PUT');
    expect(JSON.parse(String(spy.mock.calls[1]?.[1]?.body))).toEqual({
      addresses: [
        home,
        {
          label: 'Amir Temur 108, 4-qavat',
          address: 'Amir Temur 108, 4-qavat',
          note: null,
          is_default: false,
        },
      ],
    });
  });

  it('marks the very first address as the default one', async () => {
    const spy = apiAnswers({ status: 200, body: stored([]) });

    await POST(request({ address: 'Chilonzor 24' }));

    const sent = JSON.parse(String(spy.mock.calls[1]?.[1]?.body)) as {
      addresses: { is_default: boolean }[];
    };

    expect(sent.addresses[0]?.is_default).toBe(true);
  });

  it('writes nothing when the stored book could not be read', async () => {
    const spy = apiAnswers({ status: 500, body: {} });

    const response = await POST(request({ address: 'Chilonzor 24' }));

    expect(response.status).toBe(502);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('refuses a seventh address rather than having the API drop one', async () => {
    const spy = apiAnswers({ status: 200, body: stored(Array.from({ length: 6 }, () => home)) });

    const response = await POST(request({ address: 'Chilonzor 24' }));

    expect(response.status).toBe(422);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('refuses an empty address and answers 401 with no session', async () => {
    const spy = apiAnswers({ status: 200, body: stored([]) });

    expect((await POST(request({ address: '   ' }))).status).toBe(400);
    expect((await POST(request({ address: 'x' }, false))).status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });
});
