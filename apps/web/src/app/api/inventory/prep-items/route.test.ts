import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';
import { SESSION_COOKIE } from '@/lib/server-session';

type Leg = { url: string; body: Record<string, unknown> };

function upstream(status = 201): Leg[] {
  const legs: Leg[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      legs.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });

      return new Response(JSON.stringify({ data: { id: 4 } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return legs;
}

function request(body: unknown) {
  return new NextRequest('http://localhost:3000/api/inventory/prep-items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: `${SESSION_COOKIE}=tok_1` },
    body: JSON.stringify(body),
  });
}

const card = {
  code: ' Zirvak ',
  name: '  Zirvak  ',
  unit: 'g',
  batchQuantity: 1000,
  lossPercent: 20,
  shelfLifeDays: 2,
  components: [{ ingredientId: 4, quantity: 400 }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/inventory/prep-items', () => {
  it('sends the API the shape it validates, with the code folded down', async () => {
    const legs = upstream();

    const answer = await POST(request(card));

    expect(answer.status).toBe(201);
    expect(legs[0]?.url).toContain('/inventory/prep-items');
    expect(legs[0]?.body).toEqual({
      code: 'zirvak',
      // One name in three fields: the form asks once, and a cook naming a batch
      // of dough writes one word.
      name: { uz: 'Zirvak', ru: 'Zirvak', en: 'Zirvak' },
      unit: 'g',
      batch_quantity: 1000,
      loss_percent: 20,
      shelf_life_days: 2,
      components: [{ ingredient_id: 4, quantity: 400 }],
    });
  });

  it('never sends a starting balance', async () => {
    const legs = upstream();

    await POST(request({ ...card, onHand: 5000 }));

    // Stock arrives by being received or produced, both of which write a
    // movement. A balance typed into a form is stock the ledger never saw.
    expect(legs[0]?.body).not.toHaveProperty('on_hand');
  });

  it('refuses a card with no components before the round trip', async () => {
    const legs = upstream();

    const answer = await POST(request({ ...card, components: [] }));

    expect(answer.status).toBe(400);
    expect(await answer.json()).toEqual({ error: 'no_components' });
    expect(legs).toHaveLength(0);
  });

  it('refuses a total loss, which the yield would divide by', async () => {
    const legs = upstream();

    expect((await POST(request({ ...card, lossPercent: 100 }))).status).toBe(400);
    expect(legs).toHaveLength(0);
  });

  it('refuses a purchase unit, because a balance is held in base units', async () => {
    const legs = upstream();

    expect((await POST(request({ ...card, unit: 'kg' }))).status).toBe(400);
    expect(legs).toHaveLength(0);
  });

  it('drops a component row that carries no id rather than posting a hole', async () => {
    const legs = upstream();

    await POST(
      request({
        ...card,
        components: [{ ingredientId: 4, quantity: 400 }, { quantity: 100 }],
      }),
    );

    expect(legs[0]?.body.components).toEqual([{ ingredient_id: 4, quantity: 400 }]);
  });
});
