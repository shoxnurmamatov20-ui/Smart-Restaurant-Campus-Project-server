import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';
import { MP_SESSION_COOKIE } from '@/lib/mp-cookie';

/**
 * Four notification switches, without an API behind it.
 *
 * Two things are under test and both are about a switch reading as ON when the
 * guest set it OFF.
 *
 * The first is coercion. `"false"` is a truthy string, and a handler that let
 * one through would opt somebody into marketing they had just turned off — so
 * anything that is not a boolean is refused rather than converted.
 *
 * The second is completeness. All four go up every time, so "unchanged" cannot
 * be confused with "false" by whichever layer looks next; the endpoint takes a
 * name and a locale too, and neither is forwarded from this sheet.
 */
function request(body: unknown, cookies: Record<string, string> = { [MP_SESSION_COOKIE]: 'mp_1' }) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

  return new NextRequest('http://localhost:3000/api/mp/me', {
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

const prefs = { orders: true, promos: false, delivery: true, newsletter: false };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/mp/me', () => {
  it('sends all four preferences under the column they live in', async () => {
    const spy = apiReturns(200, { data: { notification_prefs: prefs } });

    const response = await POST(request({ notificationPrefs: prefs }));

    expect(response.status).toBe(200);
    expect(String(spy.mock.calls[0]?.[0])).toContain('/mp/me');
    expect(spy.mock.calls[0]?.[1]?.method).toBe('PATCH');
    expect(JSON.parse(String(spy.mock.calls[0]?.[1]?.body))).toEqual({
      notification_prefs: prefs,
    });
  });

  it('refuses a string that would read as true', async () => {
    const spy = apiReturns(200, {});

    const response = await POST(request({ notificationPrefs: { ...prefs, newsletter: 'false' } }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_prefs' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses a partial object rather than filling the gaps in', async () => {
    // A missing key here would be a default somewhere else, and two copies of a
    // default is a switch that renders differently in the app and on the web.
    apiReturns(200, {});

    expect((await POST(request({ notificationPrefs: { orders: true } }))).status).toBe(400);
    expect((await POST(request({}))).status).toBe(400);
  });

  it('forwards nothing but the preferences', async () => {
    const spy = apiReturns(200, {});

    await POST(request({ notificationPrefs: prefs, name: 'Somebody Else', locale: 'ru' }));

    const sent = JSON.parse(String(spy.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;

    // A sheet about four switches that could also rename the account is a sheet
    // that renames the account when a caller passes the wrong object.
    expect(Object.keys(sent)).toEqual(['notification_prefs']);
  });

  it('answers 401 without a customer session', async () => {
    const spy = apiReturns(200, {});

    const response = await POST(request({ notificationPrefs: prefs }, {}));

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });
});
