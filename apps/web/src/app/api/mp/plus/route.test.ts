import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';
import { MP_SESSION_COOKIE } from '@/lib/mp-cookie';
import { SESSION_COOKIE } from '@/lib/server-session';

/**
 * Buying MyPOS Plus, without an API behind it.
 *
 * The credential is the interesting part. A marketplace customer is not a
 * member of staff: their token is in the seventh cookie, not the console's, and
 * a handler that read the wrong one would work perfectly for whoever happened
 * to be signed into the console in the same browser — and charge their card.
 *
 * The rest is what is not sent. The price is the platform's, so a subscribe
 * that carried an amount would be a guest naming what they pay.
 */
function request(body: unknown, cookies: Record<string, string> = { [MP_SESSION_COOKIE]: 'mp_1' }) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

  return new NextRequest('http://localhost:3000/api/mp/plus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function apiReturns(status: number, payload: unknown) {
  const spy = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(payload), { status }));
  vi.stubGlobal('fetch', spy);

  return spy;
}

const authOf = (spy: ReturnType<typeof apiReturns>) =>
  (spy.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined)?.Authorization;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/mp/plus', () => {
  it('subscribes on the customer’s own token, with no amount attached', async () => {
    const spy = apiReturns(201, { data: { active: true, monthly_tiyin: 3_900_000 } });

    const response = await POST(request({ action: 'subscribe' }));

    expect(response.status).toBe(201);
    expect(String(spy.mock.calls[0]?.[0])).toContain('/mp/plus/subscribe');
    expect(authOf(spy)).toBe('Bearer mp_1');
    expect(JSON.parse(String(spy.mock.calls[0]?.[1]?.body))).toEqual({});
  });

  it('cancels through the other path', async () => {
    const spy = apiReturns(200, { data: { active: false, state: 'cancelled' } });

    await POST(request({ action: 'cancel' }));

    expect(String(spy.mock.calls[0]?.[0])).toContain('/mp/plus/cancel');
  });

  it('reaches no path the file does not name', async () => {
    const spy = apiReturns(200, {});

    const response = await POST(request({ action: '../../admin/login' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_body' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not accept a console session in place of a customer’s', async () => {
    /*
     * The two credentials are deliberately different cookies. A console session
     * belongs to a member of staff with a tenant and a role; nobody's card is
     * behind it, and mistaking one for the other would take money from a
     * marketplace account that was never asked.
     */
    const spy = apiReturns(201, {});

    const response = await POST(request({ action: 'subscribe' }, { [SESSION_COOKIE]: 'tok_1' }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'not_signed_in' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('keeps a double tap apart from a provider outage', async () => {
    // 422 is "you already have it" and nothing was charged; 502 is "the
    // provider is down" and is worth trying again. One message for both would
    // have a guest cancelling a live subscription to fix a problem they do not
    // have.
    apiReturns(422, {
      error: { code: 'marketplace.plus_already_active', message_uz: 'Obuna allaqachon faol.' },
    });

    const already = await POST(request({ action: 'subscribe' }));

    expect(already.status).toBe(422);
    expect(await already.json()).toMatchObject({
      error: { code: 'marketplace.plus_already_active' },
    });

    apiReturns(502, { error: { code: 'marketplace.plus_payment_unavailable' } });

    const down = await POST(request({ action: 'subscribe' }));

    expect(down.status).toBe(502);
  });

  it('tells an unreachable API apart from a refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const response = await POST(request({ action: 'subscribe' }));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'api_unreachable' });
  });
});
