import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CREW_SESSION_COOKIE, CREW_TENANT_COOKIE } from '../../crew-session';
import { POST } from './route';

type Leg = { url: string; method: string; body: Record<string, unknown> };

function upstream(status = 201): Leg[] {
  const legs: Leg[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      legs.push({
        url,
        method: String(init.method),
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
      });

      return new Response(JSON.stringify({ data: { id: 7, number: 'PO-0007' } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return legs;
}

function request(body: unknown, signedIn = true) {
  return new NextRequest('http://localhost:3000/crew/purchase', {
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

const line = { ingredientId: 12, name: "Mol go'shti", unit: 'kg', quantity: 25 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /crew/purchase', () => {
  it('raises a draft, never a sent order', async () => {
    const legs = upstream();

    const answer = await POST(request({ supplierId: 3, lines: [line] }));

    expect(answer.status).toBe(201);
    expect(legs[0]?.url).toContain('/suppliers/purchase-orders');
    // A phone raises a request; a manager looking at a bank balance decides
    // whether this restaurant buys twenty-five kilos of lamb this week.
    expect(legs[0]?.body.status).toBe('draft');
    expect(legs[0]?.body.supplier_id).toBe(3);
  });

  it('sends no price, so the document a manager signs carries no agreed figure', async () => {
    const legs = upstream();

    await POST(request({ supplierId: 3, lines: [line] }));

    expect(legs[0]?.body.items).toEqual([
      { ingredient_id: 12, name: "Mol go'shti", unit: 'kg', quantity: 25, unit_price: 0 },
    ]);
  });

  it('drops a line left at zero rather than refusing the sheet', async () => {
    const legs = upstream();

    // The ordinary way this screen is used: it opens on the suggestions and the
    // storekeeper zeroes the two they do not need.
    await POST(
      request({ supplierId: 3, lines: [line, { ...line, ingredientId: 13, quantity: 0 }] }),
    );

    expect(legs[0]?.body.items).toHaveLength(1);
  });

  it('refuses a sheet with nothing on it, before the round trip', async () => {
    const legs = upstream();

    const answer = await POST(request({ supplierId: 3, lines: [{ ...line, quantity: 0 }] }));

    expect(answer.status).toBe(400);
    expect(legs).toEqual([]);
  });

  it('refuses a sheet with no supplier to address it to', async () => {
    const legs = upstream();

    const answer = await POST(request({ lines: [line] }));

    expect(answer.status).toBe(400);
    expect(legs).toEqual([]);
  });

  it('answers 401 rather than calling upstream when the shift session is gone', async () => {
    const legs = upstream();

    const answer = await POST(request({ supplierId: 3, lines: [line] }, false));

    // The screen acts on this: the person needs the keypad, not a retry.
    expect(answer.status).toBe(401);
    expect(legs).toEqual([]);
  });

  it('mints its own idempotency key — the API refuses a write without one', async () => {
    const keys: string[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        keys.push(String((init.headers as Record<string, string>)['Idempotency-Key']));

        return new Response(JSON.stringify({ data: {} }), { status: 201 });
      }),
    );

    await POST(request({ supplierId: 3, lines: [line] }));

    expect(keys[0]).toMatch(/[0-9a-f-]{36}/);
  });
});
