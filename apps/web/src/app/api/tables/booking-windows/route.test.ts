import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST, spansOf } from './route';
import { SESSION_COOKIE } from '@/lib/server-session';

/**
 * Closing one hour, against a table that stores spans.
 *
 * Two things are under test and only one of them is arithmetic. The first is
 * that the hours fold back into the same rows a venue would have typed —
 * including the awkward one, where a run ending at 23:00 and a run starting at
 * 00:00 are ONE window and not two.
 *
 * The second is the order of the writes. Deleting the old row before creating
 * the new one leaves a gap, and a gap on this table is a website that takes no
 * bookings for that evening — the guest who tried during it does not come back
 * to see whether it was fixed. An overlap costs nothing by comparison:
 * `BookingDiary::slotsOn()` keys slots by the instant, so two windows over the
 * same hour produce one slot rather than two.
 */
function request(body: unknown, cookies: Record<string, string> = { [SESSION_COOKIE]: 'tok_1' }) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

  return new NextRequest('http://localhost:3000/api/tables/booking-windows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

type ApiWindow = {
  id: number;
  branch_id: number;
  weekday: number;
  opens_at: string;
  closes_at: string;
  slot_minutes: number;
  capacity: number;
  is_active: boolean;
};

function row(over: Partial<ApiWindow> = {}): ApiWindow {
  return {
    id: 12,
    branch_id: 1,
    weekday: 5,
    opens_at: '10:00',
    closes_at: '23:00',
    slot_minutes: 30,
    capacity: 40,
    is_active: true,
    ...over,
  };
}

/** Every upstream call this handler made, in the order it made them. */
type Leg = { method: string; url: string; body: Record<string, unknown> | null };

/**
 * Answer the list with `windows`, and accept every write after it.
 *
 * `refuse` turns the first write of that verb into the API's own refusal
 * envelope, which is how the handler's give-up path is exercised.
 */
function serve(windows: ApiWindow[], refuse?: { method: string; status: number; code: string }) {
  const legs: Leg[] = [];

  const spy = vi.fn<typeof fetch>(async (input, init) => {
    const method = init?.method ?? 'GET';
    const url = String(input);

    legs.push({
      method,
      url,
      body:
        typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    });

    if (method === 'GET') {
      return new Response(JSON.stringify({ data: windows }), { status: 200 });
    }

    if (refuse !== undefined && refuse.method === method) {
      return new Response(
        JSON.stringify({ error: { code: refuse.code, message_uz: 'Ruxsat yo‘q' } }),
        { status: refuse.status },
      );
    }

    if (method === 'DELETE') return new Response(null, { status: 204 });

    return new Response(JSON.stringify({ data: row() }), { status: method === 'POST' ? 201 : 200 });
  });

  vi.stubGlobal('fetch', spy);

  return legs;
}

const writes = (legs: Leg[]) => legs.filter((leg) => leg.method !== 'GET');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('spansOf', () => {
  it('folds a run of hours into the span a venue would have typed', () => {
    expect(spansOf([11, 12, 13])).toEqual([
      { opens: '11:00', closes: '14:00', hours: [11, 12, 13] },
    ]);
  });

  it('splits at a gap, which is what closing an hour inside a service means', () => {
    expect(spansOf([10, 11, 12, 13, 14, 16, 17]).map((span) => [span.opens, span.closes])).toEqual([
      ['10:00', '15:00'],
      ['16:00', '18:00'],
    ]);
  });

  it('closes the last hour of the day on midnight rather than on 24:00', () => {
    // `24:00` is not a wall clock and the endpoint refuses it as a format.
    expect(spansOf([22, 23])).toEqual([{ opens: '22:00', closes: '00:00', hours: [22, 23] }]);
  });

  it('joins the run either side of midnight into one window', () => {
    /*
     * A bar's Friday from six until one. Written as two rows, the `00:00` one
     * would mean slots early on Friday MORNING — a different night from the one
     * the grid was showing, and one nobody asked for.
     */
    expect(spansOf([0, 18, 19, 20, 21, 22, 23])).toEqual([
      { opens: '18:00', closes: '01:00', hours: [18, 19, 20, 21, 22, 23, 0] },
    ]);
  });

  it('keeps a lone midnight hour as its own morning window', () => {
    expect(spansOf([0])).toEqual([{ opens: '00:00', closes: '01:00', hours: [0] }]);
  });

  it('writes a venue that books around the clock as one wrapping row', () => {
    const spans = spansOf(Array.from({ length: 24 }, (_, hour) => hour));

    expect(spans).toHaveLength(1);
    expect([spans[0]?.opens, spans[0]?.closes]).toEqual(['00:00', '00:00']);
  });

  it('gives nothing for a weekday with nothing open', () => {
    expect(spansOf([])).toEqual([]);
  });
});

describe('POST /api/tables/booking-windows', () => {
  it('splits one row in two when an hour inside a service is closed', async () => {
    // 10:00–23:00 with 15:00 taken out: the standing row is shortened and a
    // second one opens after the gap. Nothing is deleted.
    const legs = serve([row({ id: 12, opens_at: '10:00', closes_at: '23:00' })]);

    const open = [10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22];
    const response = await POST(request({ weekday: 5, hours: open, branchId: 1 }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { weekday: 5, hours: open, branchId: 1 } });

    const sent = writes(legs);

    expect(sent).toHaveLength(2);
    expect(sent[0]?.method).toBe('PATCH');
    expect(sent[0]?.url).toContain('/tables/booking-windows/12');
    expect(sent[0]?.body).toMatchObject({ opens_at: '10:00', closes_at: '15:00', weekday: 5 });

    expect(sent[1]?.method).toBe('POST');
    expect(sent[1]?.body).toMatchObject({ opens_at: '16:00', closes_at: '23:00' });
  });

  it('gives the new half of a split the capacity the evening already had', async () => {
    /*
     * The quiet mistake this inheritance prevents: the column defaults to twenty
     * covers, so a forty-cover evening split in two would come back half the
     * size on the side nobody touched.
     */
    const legs = serve([row({ id: 12, capacity: 40, slot_minutes: 60 })]);

    await POST(request({ weekday: 5, hours: [10, 11, 13, 14], branchId: 1 }));

    const created = writes(legs).find((leg) => leg.method === 'POST');

    expect(created?.body).toMatchObject({ capacity: 40, slot_minutes: 60 });
  });

  it('creates before it deletes', async () => {
    // Moving a service from the morning to the evening: the new row exists
    // before the old one stops, so the site is never a venue with no diary.
    const legs = serve([row({ id: 12, opens_at: '10:00', closes_at: '12:00' })]);

    await POST(request({ weekday: 5, hours: [18, 19], branchId: 1 }));

    expect(writes(legs).map((leg) => leg.method)).toEqual(['POST', 'DELETE']);
  });

  it('deletes the row when the last open hour of a weekday is closed', async () => {
    const legs = serve([row({ id: 12, opens_at: '18:00', closes_at: '19:00' })]);

    await POST(request({ weekday: 5, hours: [], branchId: 1 }));

    expect(writes(legs)).toHaveLength(1);
    expect(writes(legs)[0]?.method).toBe('DELETE');
    expect(writes(legs)[0]?.url).toContain('/tables/booking-windows/12');
  });

  it('switches a disabled row back on rather than opening a second one', async () => {
    const legs = serve([row({ id: 12, opens_at: '18:00', closes_at: '20:00', is_active: false })]);

    await POST(request({ weekday: 5, hours: [18, 19], branchId: 1 }));

    expect(writes(legs)).toHaveLength(1);
    expect(writes(legs)[0]?.method).toBe('PATCH');
    expect(writes(legs)[0]?.body).toMatchObject({ is_active: true });
  });

  it('writes nothing when the weekday already says exactly this', async () => {
    // A write that changes nothing is a row in the audit log somebody has to
    // read later and wonder about.
    const legs = serve([row({ id: 12, opens_at: '18:00', closes_at: '20:00' })]);

    const response = await POST(request({ weekday: 5, hours: [18, 19], branchId: 1 }));

    expect(response.status).toBe(200);
    expect(writes(legs)).toEqual([]);
  });

  it('leaves another weekday’s rows alone', async () => {
    const legs = serve([
      row({ id: 12, weekday: 5, opens_at: '18:00', closes_at: '20:00' }),
      row({ id: 13, weekday: 6, opens_at: '18:00', closes_at: '20:00' }),
    ]);

    await POST(request({ weekday: 5, hours: [], branchId: 1 }));

    expect(writes(legs).map((leg) => leg.url.split('/').at(-1))).toEqual(['12']);
  });

  it('refuses to rewrite a weekday when the answer spans an estate', async () => {
    /*
     * An owner is pinned to no venue, so the list comes back with every venue's
     * windows on it. Rewriting the weekday across all of them would close a
     * terrace because somebody closed a mall unit.
     */
    const legs = serve([row({ id: 12, branch_id: 1 }), row({ id: 13, branch_id: 2 })]);

    const response = await POST(request({ weekday: 5, hours: [18] }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'branch_required' });
    expect(writes(legs)).toEqual([]);
  });

  it('narrows the list to the venue the grid was drawn for', async () => {
    const legs = serve([row({ branch_id: 3 })]);

    await POST(request({ weekday: 5, hours: [18], branchId: 3 }));

    expect(legs[0]?.url).toContain('/tables/booking-windows?branch_id=3');
  });

  it('hands an upstream refusal back with its own status and sentence', async () => {
    // `tables.delete` is a separate permission from `tables.update`, so this is
    // a refusal a real reader can hit — and the grid needs the words to put on
    // the tile it is about to move back.
    serve([row({ id: 12, opens_at: '18:00', closes_at: '20:00' })], {
      method: 'DELETE',
      status: 403,
      code: 'auth.forbidden',
    });

    const response = await POST(request({ weekday: 5, hours: [], branchId: 1 }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'auth.forbidden' } });
  });

  it('stops at the first refusal rather than carrying on to the deletes', async () => {
    const legs = serve([row({ id: 12, opens_at: '10:00', closes_at: '12:00' })], {
      method: 'POST',
      status: 422,
      code: 'validation.failed',
    });

    const response = await POST(request({ weekday: 5, hours: [18, 19], branchId: 1 }));

    expect(response.status).toBe(422);
    // Nothing was deleted, so the weekday is still bookable and pressing the
    // tile again re-derives the whole plan from what is actually there.
    expect(writes(legs).map((leg) => leg.method)).toEqual(['POST']);
  });

  it('refuses an hour that is not one, before it becomes the string 26:00', async () => {
    const legs = serve([]);

    for (const hours of [[26], [-1], [1.5], ['18'], 18]) {
      const response = await POST(request({ weekday: 5, hours, branchId: 1 }));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_hours' });
    }

    expect(legs).toEqual([]);
  });

  it('refuses a weekday outside the ISO range', async () => {
    const legs = serve([]);

    for (const weekday of [0, 8, '5', null]) {
      const response = await POST(request({ weekday, hours: [18], branchId: 1 }));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_weekday' });
    }

    expect(legs).toEqual([]);
  });

  it('refuses a capacity that would write an evening nobody could book', async () => {
    const legs = serve([]);

    const response = await POST(request({ weekday: 5, hours: [18], capacity: -4, branchId: 1 }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_capacity' });
    expect(legs).toEqual([]);
  });

  it('never reaches the API without a session', async () => {
    const legs = serve([]);

    const response = await POST(request({ weekday: 5, hours: [18], branchId: 1 }, {}));

    expect(response.status).toBe(401);
    expect(legs).toEqual([]);
  });
});
