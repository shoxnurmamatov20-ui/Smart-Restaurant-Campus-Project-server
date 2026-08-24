import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';
import { SESSION_COOKIE } from '@/lib/server-session';

/**
 * Changing a live offer, without an API behind it.
 *
 * `fetch` is stubbed, so what is under test is this handler's own judgement:
 * what it refuses before anything leaves the box, what it renames on the way
 * up, and what it hands back untouched.
 *
 * The refusals are the point. This route is reachable from a browser with the
 * operator's own token behind it, and a promotion is a row that spends money
 * every hour it is running — so a body it does not understand must never become
 * a PATCH with a guessed field in it.
 */
function request(body: unknown, cookies: Record<string, string> = { [SESSION_COOKIE]: 'tok_1' }) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

  return new NextRequest('http://localhost:3000/api/marketplace/promotions/41', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

const params = (promotion: string) => ({ params: Promise.resolve({ promotion }) });

function apiReturns(status: number, payload: unknown) {
  const spy = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(payload), { status }));
  vi.stubGlobal('fetch', spy);

  return spy;
}

const sentBody = (spy: ReturnType<typeof apiReturns>) =>
  JSON.parse(String(spy.mock.calls[0]?.[1]?.body ?? '{}')) as Record<string, unknown>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/marketplace/promotions/[promotion]', () => {
  it('pauses a running offer and passes the row back', async () => {
    const spy = apiReturns(200, { data: { id: 41, state: 'paused' } });

    const response = await POST(request({ state: 'paused' }), params('41'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { id: 41, state: 'paused' } });

    expect(String(spy.mock.calls[0]?.[0])).toContain('/marketplace/promotions/41');
    expect(spy.mock.calls[0]?.[1]?.method).toBe('PATCH');
    expect(sentBody(spy)).toEqual({ state: 'paused' });
  });

  it('renames the budget to the column it lands in, in whole tiyin', async () => {
    const spy = apiReturns(200, { data: { id: 41 } });

    await POST(request({ budgetTiyin: 84_000_000 }), params('41'));

    expect(sentBody(spy)).toEqual({ budget_tiyin: 84_000_000 });
  });

  it('refuses a fractional budget rather than letting a layer round it', async () => {
    // Money is an integer end to end. A float here would be rounded by
    // whichever layer noticed first, which is not a decision this route makes.
    apiReturns(200, {});

    const response = await POST(request({ budgetTiyin: 1_000.5 }), params('41'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'nothing_to_change' });
  });

  it('refuses a state the API does not accept from a merchant', async () => {
    // `draft` is one of the module's states and is not one an offer goes back
    // to. A merchant who could send it would be un-publishing a live campaign.
    apiReturns(200, {});

    const response = await POST(request({ state: 'draft' }), params('41'));

    expect(response.status).toBe(400);
  });

  it('refuses a sample card before it can reach a real campaign', async () => {
    // The board draws `p1`, `p2`, `p3` when the API cannot answer. A PATCH
    // aimed at one of those would either 404 or hit whichever real promotion
    // holds that id.
    const spy = apiReturns(200, {});

    const response = await POST(request({ state: 'paused' }), params('p2'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_promotion' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('passes a refusal through with its own status and sentence', async () => {
    // `marketplace.budget_below_spend` means "type a bigger number" and
    // `marketplace.promotion_transition` means "reload this screen". A second
    // copy of either sentence here would drift from the first.
    apiReturns(422, {
      error: { code: 'marketplace.budget_below_spend', message_uz: 'Byudjet sarfdan kam.' },
    });

    const response = await POST(request({ budgetTiyin: 1_000 }), params('41'));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: 'marketplace.budget_below_spend' },
    });
  });

  it('answers 401 without a session rather than asking upstream', async () => {
    const spy = apiReturns(200, {});

    const response = await POST(request({ state: 'paused' }, {}), params('41'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'not_signed_in' });
    expect(spy).not.toHaveBeenCalled();
  });
});
