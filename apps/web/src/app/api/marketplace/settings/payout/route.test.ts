import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';
import { SESSION_COOKIE } from '@/lib/server-session';

/**
 * Changing where a week's takings land, without an API behind it.
 *
 * The digit counts are the test, and they are not pedantry: an MFO is five
 * digits, an account twenty, an INN nine, and a payment order built from a
 * wrong-length field is a transfer that bounces a week after somebody typed it.
 * The route refuses each one separately so the sheet can name the field.
 *
 * The other assertion is about what is NOT sent. A card number has no place in
 * a bank transfer and no place in this handler; a caller that included one must
 * not have it forwarded, stored or logged.
 */
function request(body: unknown, cookies: Record<string, string> = { [SESSION_COOKIE]: 'tok_1' }) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

  return new NextRequest('http://localhost:3000/api/marketplace/settings/payout', {
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

const details = {
  bankName: 'Kapitalbank',
  mfo: '00450',
  account: '20208000447190123456',
  inn: '302481776',
  holder: 'OSH XONA MCHJ',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/marketplace/settings/payout', () => {
  it('sends the five fields as a whole PUT', async () => {
    const spy = apiReturns(200, { data: { state: 'pending_review' } });

    const response = await POST(request(details));

    expect(response.status).toBe(200);
    expect(String(spy.mock.calls[0]?.[0])).toContain('/marketplace/settings/payout');
    // PUT rather than PATCH: an MFO from one bank and an account from another
    // is not half a saved form, it is a payment that bounces.
    expect(spy.mock.calls[0]?.[1]?.method).toBe('PUT');
    expect(JSON.parse(String(spy.mock.calls[0]?.[1]?.body))).toEqual({
      bank_name: 'Kapitalbank',
      mfo: '00450',
      account: '20208000447190123456',
      inn: '302481776',
      holder: 'OSH XONA MCHJ',
    });
  });

  it('never forwards a card number, whatever a caller sends', async () => {
    const spy = apiReturns(200, {});

    await POST(request({ ...details, card: '8600123412341234', cardToken: 'tok' }));

    const sent = String(spy.mock.calls[0]?.[1]?.body);

    expect(sent).not.toContain('8600123412341234');
    expect(sent).not.toContain('card');
  });

  it('refuses each wrong-length field on its own', async () => {
    const spy = apiReturns(200, {});

    const mfo = await POST(request({ ...details, mfo: '0045' }));
    const account = await POST(request({ ...details, account: '2020800044719012' }));
    const inn = await POST(request({ ...details, inn: '30248177' }));

    expect(await mfo.json()).toEqual({ error: 'invalid_mfo' });
    expect(await account.json()).toEqual({ error: 'invalid_account' });
    expect(await inn.json()).toEqual({ error: 'invalid_inn' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses letters in a field that is only ever digits', async () => {
    apiReturns(200, {});

    // A space or a dash typed out of a bank's own printout is still not a
    // digit, and upstream would refuse it — one round trip later.
    expect((await POST(request({ ...details, account: '2020 8000 4471 9012' }))).status).toBe(400);
  });

  it('refuses an empty bank or holder rather than saving a blank', async () => {
    apiReturns(200, {});

    expect((await POST(request({ ...details, bankName: '   ' }))).status).toBe(400);
    expect((await POST(request({ ...details, holder: '' }))).status).toBe(400);
  });

  it('passes the API’s own refusal through', async () => {
    apiReturns(422, {
      error: { code: 'request.validation_failed', message_uz: 'MFO topilmadi.' },
    });

    const response = await POST(request(details));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: 'request.validation_failed' } });
  });

  it('answers 401 without a session rather than asking upstream', async () => {
    const spy = apiReturns(200, {});

    const response = await POST(request(details, {}));

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });
});
