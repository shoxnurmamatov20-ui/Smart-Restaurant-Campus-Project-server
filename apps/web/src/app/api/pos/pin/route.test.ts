import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { DELETE, POST } from './route';
import { POS_SHIFT_COOKIE } from '@/lib/pos-session';

/**
 * Somebody takes the till.
 *
 * The test that earns its place is the boring-looking one about a header. Every
 * write to this API needs an `Idempotency-Key`, and signing in is a write — it
 * opens a session. The handler shipped without one and nobody could sign in at
 * all: the API answered `request.idempotency_key_missing` and the keypad showed
 * a refusal with no obvious cause. It survived review because the pairing call
 * next door needs no key — that route sits outside the tenant middleware group
 * — so the two look alike and are not. It was found by running the whole flow
 * against the live server.
 *
 * The rest is about what the handler must not do: send the PIN anywhere but
 * upstream, invent its own words for a refusal the API already has words for,
 * or set a session cookie on anything other than a success.
 */
const paired = {
  restaurantCookies: `restaurant-campus-terminal=trm_1; restaurant-campus-terminal-tenant=demo`,
};

function request(body: unknown) {
  return new NextRequest('http://localhost:3000/api/pos/pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: paired.restaurantCookies },
    body: JSON.stringify(body),
  });
}

function apiReturns(status: number, payload: unknown) {
  const spy = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(payload), { status }));
  vi.stubGlobal('fetch', spy);

  return spy;
}

const cookiesOf = (response: Response) => response.headers.getSetCookie().join('\n');

const headersOf = (spy: ReturnType<typeof apiReturns>) =>
  (spy.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;

const signedIn = {
  token: 'shift_9|secret',
  session: { user: { id: 7, name: 'Malika Tosheva', roles: ['cashier'] } },
};

beforeEach(() => {
  // The handler reads the device token from the cookie store, which in a route
  // handler test comes from the request itself.
  vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: () => 'fixed-uuid' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/pos/pin', () => {
  it('sends an idempotency key, because signing in is a write', async () => {
    const spy = apiReturns(201, signedIn);

    await POST(request({ user_id: 7, pin: '3003' }));

    // Without this the API refuses every attempt and the till cannot be used.
    expect(headersOf(spy)['Idempotency-Key']).toBe('fixed-uuid');
  });

  it('keeps the shift token out of the page', async () => {
    apiReturns(201, signedIn);

    const response = await POST(request({ user_id: 7, pin: '3003' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: { id: 7, name: 'Malika Tosheva', roles: ['cashier'] },
    });
    expect(cookiesOf(response)).toMatch(
      new RegExp(`${POS_SHIFT_COOKIE}=[^;]*;[^\\n]*HttpOnly`, 'i'),
    );
  });

  it('never sets a session on a refusal', async () => {
    // A wrong PIN that left a cookie behind would be a till anybody could open
    // by typing four wrong digits and reloading.
    apiReturns(422, { error: { code: 'pos.pin_invalid', errors: { pin: ['PIN xato.'] } } });

    const response = await POST(request({ user_id: 7, pin: '0000' }));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ message: 'PIN xato.' });
    expect(cookiesOf(response)).not.toContain(POS_SHIFT_COOKIE);
  });

  it('refuses before calling the API when the tablet is not paired', async () => {
    const spy = apiReturns(201, signedIn);

    const unpaired = new NextRequest('http://localhost:3000/api/pos/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: 7, pin: '3003' }),
    });

    expect((await POST(unpaired)).status).toBe(409);
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses a malformed attempt without spending one upstream', async () => {
    // The lockout counts attempts, so a request this handler could have
    // rejected must not cost somebody one of their five.
    const spy = apiReturns(201, signedIn);

    expect((await POST(request({ user_id: 0, pin: '3003' }))).status).toBe(422);
    expect((await POST(request({ user_id: 7, pin: '' }))).status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/pos/pin', () => {
  it('drops the shift and leaves the pairing alone', async () => {
    const response = await DELETE();
    const jar = cookiesOf(response);

    expect(jar).toMatch(new RegExp(`${POS_SHIFT_COOKIE}=;[^\\n]*Max-Age=0`, 'i'));
    // Handing the till to the next person must not un-pair the tablet.
    expect(jar).not.toContain('restaurant-campus-terminal=');
  });
});
