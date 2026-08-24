import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';
import { SESSION_COOKIE } from '@/lib/server-session';

/**
 * "Run again", which is a create.
 *
 * The button on a finished offer used to flash a confirmation and create
 * nothing. What is checked here is what the copy is allowed to carry: a title
 * with at least the Uzbek line, one of the three declared kinds, and a budget
 * in whole tiyin — because an offer with no ceiling is the one way a merchant
 * can lose an unbounded amount on this platform, and a float budget is a
 * ceiling whichever layer notices first gets to round.
 *
 * And the state: a copy is `scheduled`, never `running`. Going live on the
 * press would start spending against a budget nobody has looked at since last
 * month.
 */
function request(body: unknown, signedIn = true) {
  return new NextRequest('http://localhost:3000/api/marketplace/promotions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signedIn ? { cookie: `${SESSION_COOKIE}=tok_1` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function apiReturns(status: number, payload: unknown) {
  const spy = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(payload), { status }));
  vi.stubGlobal('fetch', spy);

  return spy;
}

const offer = {
  title: { uz: 'Ikkinchi osh yarim narxda', ru: 'Второй плов', en: 'Second plov' },
  kind: 'discount',
  discountTiyin: 1_500_000,
  budgetTiyin: 84_000_000,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/marketplace/promotions', () => {
  it('creates the copy as a scheduled offer, never a running one', async () => {
    const spy = apiReturns(201, { data: { id: 9 } });

    const response = await POST(request(offer));

    expect(response.status).toBe(201);
    expect(String(spy.mock.calls[0]?.[0])).toContain('/marketplace/promotions');
    expect(JSON.parse(String(spy.mock.calls[0]?.[1]?.body))).toEqual({
      title: { uz: 'Ikkinchi osh yarim narxda', ru: 'Второй плов', en: 'Second plov' },
      body: null,
      kind: 'discount',
      state: 'scheduled',
      budget_tiyin: 84_000_000,
      discount_tiyin: 1_500_000,
    });
  });

  it('refuses a kind that is not one of the three', async () => {
    const spy = apiReturns(201, {});

    expect((await POST(request({ ...offer, kind: 'cashback' }))).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses an offer with no ceiling and one with a fractional ceiling', async () => {
    const spy = apiReturns(201, {});

    expect((await POST(request({ ...offer, budgetTiyin: undefined }))).status).toBe(400);
    expect((await POST(request({ ...offer, budgetTiyin: 1.5 }))).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses a title with no Uzbek line, which is the one the API requires', async () => {
    const spy = apiReturns(201, {});

    expect((await POST(request({ ...offer, title: { ru: 'Второй плов' } }))).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('answers 401 without a console session rather than posting anonymously', async () => {
    const spy = apiReturns(201, {});

    expect((await POST(request(offer, false))).status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });
});
