import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';
import { MP_SESSION_COOKIE } from '@/lib/mp-cookie';

/**
 * Cancel, rate and complain — the three writes a marketplace guest makes about
 * an order that already exists.
 *
 * All three were `flash()` and nothing else, so what is under test here is the
 * shape that reaches the API rather than the API's own rules: the ladder
 * decides whether a cancellation is still allowed and whether a complaint
 * settles itself, and this handler must not second-guess either. What it does
 * decide is that a rating is an integer between one and five and a dispute
 * carries one of four known kinds and whole tiyin — because a coerced value on
 * this side is a shop moved up the directory, or a refund with a fraction in it.
 */
function request(body: unknown, number = 'MP-8421', signedIn = true) {
  return new NextRequest(`http://localhost:3000/api/mp/orders/${number}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signedIn ? { cookie: `${MP_SESSION_COOKIE}=mp_1` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const params = (number = 'MP-8421') => ({ params: Promise.resolve({ number }) });

function apiReturns(status: number, payload: unknown) {
  const spy = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(payload), { status }));
  vi.stubGlobal('fetch', spy);

  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/mp/orders/[number]', () => {
  it('cancels through the order ladder rather than deciding here', async () => {
    const spy = apiReturns(200, { data: { state: 'cancelled' } });

    const response = await POST(request({ action: 'cancel' }), params());

    expect(response.status).toBe(200);
    expect(String(spy.mock.calls[0]?.[0])).toContain('/mp/orders/MP-8421/cancel');
    expect(JSON.parse(String(spy.mock.calls[0]?.[1]?.body))).toEqual({});
  });

  it('sends a rating as a whole number of stars', async () => {
    const spy = apiReturns(200, { data: { rating: 4 } });

    await POST(request({ action: 'rate', rating: 4, comment: '  good  ' }), params());

    expect(String(spy.mock.calls[0]?.[0])).toContain('/mp/orders/MP-8421/rate');
    expect(JSON.parse(String(spy.mock.calls[0]?.[1]?.body))).toEqual({
      rating: 4,
      comment: 'good',
    });
  });

  it('refuses a rating that is not one to five, rather than clamping it', async () => {
    const spy = apiReturns(200, {});

    for (const rating of [0, 6, 4.5, '5', null]) {
      const response = await POST(request({ action: 'rate', rating }), params());

      expect(response.status).toBe(400);
    }

    expect(spy).not.toHaveBeenCalled();
  });

  it('opens a dispute with one of the four kinds and whole tiyin', async () => {
    const spy = apiReturns(201, { data: { state: 'accepted' } });

    await POST(request({ action: 'dispute', kind: 'missing', amountTiyin: 1_200_000 }), params());

    expect(String(spy.mock.calls[0]?.[0])).toContain('/mp/orders/MP-8421/dispute');
    expect(JSON.parse(String(spy.mock.calls[0]?.[1]?.body))).toEqual({
      kind: 'missing',
      amount_tiyin: 1_200_000,
    });
  });

  it('refuses an unknown dispute kind and a fractional amount', async () => {
    const spy = apiReturns(201, {});

    expect(
      (await POST(request({ action: 'dispute', kind: 'other', amountTiyin: 1 }), params())).status,
    ).toBe(400);
    expect(
      (await POST(request({ action: 'dispute', kind: 'late', amountTiyin: 1.5 }), params())).status,
    ).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses an unknown verb rather than guessing which one was meant', async () => {
    const spy = apiReturns(200, {});

    expect((await POST(request({ action: 'refund' }), params())).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses an order number that is not one', async () => {
    const spy = apiReturns(200, {});

    const response = await POST(request({ action: 'cancel' }), params('../../me'));

    expect(response.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('answers 401 without a consumer session rather than posting anonymously', async () => {
    const spy = apiReturns(200, {});

    const response = await POST(request({ action: 'cancel' }, 'MP-8421', false), params());

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });
});
