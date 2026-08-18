import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { DELETE, POST } from './route';
import { POS_TENANT_COOKIE, POS_TOKEN_COOKIE } from '@/lib/pos-session';

/**
 * Turning a tablet into a till, without an API behind it.
 *
 * `fetch` is stubbed, so what is under test is this handler's own judgement:
 * which cookies it sets and how, what it normalises before sending, and which
 * refusals it keeps apart.
 *
 * The two that matter are both about what happens after a success. The device
 * token has to be httpOnly — this tablet sits face up in a dining room all day
 * and its token authorises every till operation in the venue, so a token any
 * injected script can read is the whole venue. And the restaurant slug has to
 * be set beside it, because a device token names a terminal and the API cannot
 * infer a restaurant from one the way it can from a person: token without slug
 * is a till that pairs and then reads nothing, forever.
 */
function request(body: unknown) {
  return new NextRequest('http://localhost:3000/api/pos/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function apiReturns(status: number, payload: unknown) {
  // Typed as fetch itself, so `mock.calls` carries fetch's argument tuple —
  // an argument-less `vi.fn` infers `[]` and reading calls[0][1] is a type
  // error rather than the assertion it looks like.
  const spy = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(payload), { status }));
  vi.stubGlobal('fetch', spy);

  return spy;
}

const cookiesOf = (response: Response) => response.headers.getSetCookie().join('\n');

const paired = {
  token: 'trm_1279|secret',
  terminal: { code: 'POS-3', name: 'Kirish', mode: 'counter', branch: { name: 'Chilonzor' } },
  tenant: { slug: 'demo-restaurant' },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/pos/pair', () => {
  it('keeps the device token out of the page and the slug beside it', async () => {
    apiReturns(201, paired);

    const response = await POST(request({ code: 'JW3WX55S' }));
    const jar = cookiesOf(response);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      terminal: { code: 'POS-3', name: 'Kirish', branch: 'Chilonzor' },
    });

    expect(jar).toContain(`${POS_TOKEN_COOKIE}=trm_1279%7Csecret`);
    expect(jar).toMatch(new RegExp(`${POS_TOKEN_COOKIE}=[^;]*;[^\\n]*HttpOnly`, 'i'));

    // Readable, and nothing rides on it — the API decides what the token may
    // touch regardless of what is sent beside it.
    expect(jar).toContain(`${POS_TENANT_COOKIE}=demo-restaurant`);
    expect(jar).not.toMatch(new RegExp(`${POS_TENANT_COOKIE}=[^;]*;[^\\n]*HttpOnly`, 'i'));
  });

  it('normalises what somebody typed off a spoken code', async () => {
    const spy = apiReturns(201, paired);

    await POST(request({ code: ' jw3wx55s ' }));

    const sent = JSON.parse(String(spy.mock.calls[0]?.[1]?.body ?? '{}')) as { code: string };
    expect(sent.code).toBe('JW3WX55S');
  });

  it('refuses a token that arrives without a restaurant', async () => {
    // A till that paired and then read nothing forever is worse than one that
    // refused to pair: the second has an error message.
    apiReturns(201, { ...paired, tenant: { slug: null } });

    const response = await POST(request({ code: 'JW3WX55S' }));

    expect(response.status).toBe(502);
    expect(cookiesOf(response)).not.toContain(POS_TOKEN_COOKIE);
  });

  it('passes the API’s own sentence through rather than inventing one', async () => {
    // The API already tells "wrong or used" apart from "expired" and from
    // "that till is switched off". A second copy of those words here would
    // drift from the first.
    apiReturns(422, {
      error: {
        code: 'request.validation_failed',
        errors: { code: ['Ulash kodining muddati tugagan.'] },
      },
    });

    const response = await POST(request({ code: 'EXPIRED1' }));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: 'rejected',
      message: 'Ulash kodining muddati tugagan.',
    });
    expect(cookiesOf(response)).not.toContain(POS_TOKEN_COOKIE);
  });

  it('tells an unreachable API apart from a refused code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const response = await POST(request({ code: 'JW3WX55S' }));

    // 502, not 401: "try again" and "ask for a new code" are different
    // instructions to whoever is holding the tablet.
    expect(response.status).toBe(502);
  });

  it('refuses an empty code without calling the API', async () => {
    const spy = apiReturns(201, paired);

    const response = await POST(request({ code: '   ' }));

    expect(response.status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/pos/pair', () => {
  it('forgets the token locally and does not revoke it upstream', async () => {
    const spy = apiReturns(200, {});

    const response = await DELETE();
    const jar = cookiesOf(response);

    // Revoking belongs to the manager in the back office. A till that could
    // revoke itself could be unpaired by anybody who picked it up, and coming
    // back would need a code read aloud across the room.
    expect(spy).not.toHaveBeenCalled();
    expect(jar).toMatch(new RegExp(`${POS_TOKEN_COOKIE}=;[^\\n]*Max-Age=0`, 'i'));
    expect(jar).toMatch(new RegExp(`${POS_TENANT_COOKIE}=;[^\\n]*Max-Age=0`, 'i'));
  });
});
