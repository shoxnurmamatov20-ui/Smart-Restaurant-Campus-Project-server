import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';
import { SESSION_COOKIE } from '@/lib/server-session';

/**
 * The books screen's paid/unpaid chip, on the wire.
 *
 * The interesting assertion is the second one. The API's column is `paid_at`
 * and `UpdateExpenseRequest` uses `sometimes`, so a handler that simply left
 * the key out when the chip was cleared would produce a one-way switch — and
 * the row it sits on is money the restaurant is about to report as owed. The
 * null has to travel.
 */
function request(body: unknown, signedIn = true) {
  return new NextRequest('http://localhost:3000/api/finance/expense-paid', {
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

function sent(spy: ReturnType<typeof apiReturns>): Record<string, unknown> {
  return JSON.parse(String(spy.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/finance/expense-paid', () => {
  it('patches the expense with a timestamp when the chip is closed', async () => {
    const spy = apiReturns(200, { data: { id: 12, is_paid: true } });

    const response = await POST(request({ id: 12, paid: true }));

    expect(response.status).toBe(200);
    expect(String(spy.mock.calls[0]?.[0])).toContain('/finance/expenses/12');
    // PATCH upstream, POST from the browser: `lib/console-post.ts` sends
    // nothing but POSTs and the handler speaks whatever verb the API wants.
    expect(spy.mock.calls[0]?.[1]?.method).toBe('PATCH');
    expect(typeof sent(spy).paid_at).toBe('string');
  });

  it('sends an explicit null to put an invoice back to unpaid', async () => {
    const spy = apiReturns(200, { data: { id: 12, is_paid: false } });

    await POST(request({ id: 12, paid: false }));

    expect(sent(spy)).toHaveProperty('paid_at', null);
  });

  it('refuses a body that names no row or no state', async () => {
    const spy = apiReturns(200, {});

    expect((await POST(request({ paid: true }))).status).toBe(400);
    expect((await POST(request({ id: 12 }))).status).toBe(400);
    // "true" is a string a form would send and is not a decision.
    expect((await POST(request({ id: 12, paid: 'true' }))).status).toBe(400);

    expect(spy).not.toHaveBeenCalled();
  });

  it('does not reach the API without a session', async () => {
    const spy = apiReturns(200, {});

    expect((await POST(request({ id: 12, paid: true }, false))).status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });
});
