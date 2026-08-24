import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';
import { SESSION_COOKIE } from '@/lib/server-session';

/**
 * Buying a position in the marketplace, without an API behind it.
 *
 * Two calls behind one door, so the first thing under test is that the action
 * picks the path rather than the body doing it: a caller must not be able to
 * reach a URL this file does not name, on a route that spends a merchant's
 * money by the day.
 *
 * The second is the 409. A taken slot answers with `meta.queue_days` — how long
 * until it frees — and that number has to survive the trip back, because it is
 * the difference between "not saved" and "come back on Friday".
 */
function request(body: unknown, cookies: Record<string, string> = { [SESSION_COOKIE]: 'tok_1' }) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

  return new NextRequest('http://localhost:3000/api/marketplace/placements', {
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

const booking = { action: 'book', slot: 'home_top', startsOn: '2026-08-23', days: 3 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/marketplace/placements', () => {
  it('books a slot with the window the card asked for', async () => {
    const spy = apiReturns(201, { data: { id: 7, slot: 'home_top' } });

    const response = await POST(request(booking));

    expect(response.status).toBe(201);
    expect(String(spy.mock.calls[0]?.[0])).toMatch(/\/marketplace\/placements$/);
    expect(spy.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(spy.mock.calls[0]?.[1]?.body))).toEqual({
      slot: 'home_top',
      starts_on: '2026-08-23',
      days: 3,
    });
  });

  it('sends no price, because the rate card is the platform’s', async () => {
    const spy = apiReturns(201, { data: {} });

    await POST(request({ ...booking, dayRateTiyin: 1, totalTiyin: 1 }));

    const sent = JSON.parse(String(spy.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;

    expect(Object.keys(sent).sort()).toEqual(['days', 'slot', 'starts_on']);
  });

  it('releases through DELETE while staying a POST on this side', async () => {
    const spy = apiReturns(200, { data: { id: 7, state: 'cancelled' } });

    await POST(request({ action: 'release', placementId: 7 }));

    expect(String(spy.mock.calls[0]?.[0])).toContain('/marketplace/placements/7');
    expect(spy.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });

  it('refuses a release with no numeric id', async () => {
    // The fixture card draws three rows whether or not the API answered.
    // Releasing one of those would cancel whichever real booking holds that id.
    const spy = apiReturns(200, {});

    const response = await POST(request({ action: 'release', placementId: 'banner' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_placement' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses a slot, a date or a term it does not sell', async () => {
    apiReturns(201, {});

    expect((await POST(request({ ...booking, slot: 'banner' }))).status).toBe(400);
    expect((await POST(request({ ...booking, startsOn: 'tomorrow' }))).status).toBe(400);
    // Fourteen days is the ceiling; fifteen is a standing order nobody agreed to.
    expect((await POST(request({ ...booking, days: 15 }))).status).toBe(400);
    expect((await POST(request({ ...booking, days: 0 }))).status).toBe(400);
  });

  it('keeps meta.queue_days on a taken slot', async () => {
    /*
     * A 409 here is a schedule rather than a refusal. Flattening it would throw
     * away the only number that tells a merchant when to come back — and the
     * board reads exactly this key to move its own counter.
     */
    apiReturns(409, {
      error: { code: 'marketplace.placement_slot_taken', message_uz: 'Joy band.' },
      meta: { queue_days: 4 },
    });

    const response = await POST(request(booking));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ meta: { queue_days: 4 } });
  });

  it('answers 401 without a session rather than asking upstream', async () => {
    const spy = apiReturns(201, {});

    const response = await POST(request(booking, {}));

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });
});
