import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CREW_SESSION_COOKIE, CREW_TENANT_COOKIE } from '../../crew-session';
import { POST } from './route';

type Leg = { url: string; body: Record<string, unknown> };

function upstream(status = 201, payload: unknown = { data: { id: 4 } }): Leg[] {
  const legs: Leg[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      legs.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });

      return new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return legs;
}

function request(body: unknown, signedIn = true) {
  return new NextRequest('http://localhost:3000/crew/swap', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signedIn
        ? { cookie: `${CREW_SESSION_COOKIE}=tok_1; ${CREW_TENANT_COOKIE}=osh-xona` }
        : {}),
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /crew/swap', () => {
  it('names the shift by id — the whole reason the form could not post before', async () => {
    const legs = upstream();

    const answer = await POST(request({ shiftId: 91, offeredToId: 7 }));

    expect(answer.status).toBe(201);
    expect(legs[0]?.url).toContain('/staff/shift-swaps');
    expect(legs[0]?.body).toMatchObject({ shift_id: 91, offered_to_id: 7 });
  });

  it('sends null rather than zero when nobody was picked', async () => {
    const legs = upstream();

    // Posting the shift to whoever will take it is the common case, and `0`
    // would fail an `exists` check that reads as "that colleague does not work
    // here".
    await POST(request({ shiftId: 91 }));

    expect(legs[0]?.body.offered_to_id).toBeNull();
  });

  it('refuses without a shift, before the round trip', async () => {
    const legs = upstream();

    const answer = await POST(request({ offeredToId: 7 }));

    expect(answer.status).toBe(400);
    expect(legs).toEqual([]);
  });

  it("passes the API's own refusal through with its status", async () => {
    // One live request per shift — the server says so with a catalogue code,
    // and the screen has to be able to show it rather than a network error.
    upstream(409, { error: { code: 'shift.swap_already_pending' } });

    const answer = await POST(request({ shiftId: 91 }));

    expect(answer.status).toBe(409);
    expect(await answer.json()).toMatchObject({ error: { code: 'shift.swap_already_pending' } });
  });

  it('answers 401 rather than calling upstream when the shift session is gone', async () => {
    const legs = upstream();

    const answer = await POST(request({ shiftId: 91 }, false));

    expect(answer.status).toBe(401);
    expect(legs).toEqual([]);
  });
});
