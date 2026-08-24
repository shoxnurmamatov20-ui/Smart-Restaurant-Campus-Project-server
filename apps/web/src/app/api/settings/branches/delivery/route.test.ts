import { describe, expect, it, vi } from 'vitest';

const { forward } = vi.hoisted(() => ({ forward: vi.fn() }));

vi.mock('@/lib/api-proxy', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-proxy')>('@/lib/api-proxy');

  return { ...actual, forward };
});

import { POST } from './route';

/**
 * The one panel on the branches screen a guest feels.
 *
 * `PublicOrderController` prices every delivery from the three keys this
 * handler writes, and the storefront quotes them from the same three. So the
 * failures worth a test are the ones that would send a *different* shape
 * upstream — a dotted path, a so'm figure where tiyin is meant, a float — none
 * of which the console would show as an error, and all of which end as a
 * receipt that disagrees with the price the guest was quoted.
 */
/** The panel saves all six figures at once, so a body is the whole panel. */
const panel = (over: Record<string, number> = {}) => ({
  branchId: 7,
  feeTiyin: 1_200_000,
  freeOverTiyin: 0,
  minimumTiyin: 0,
  kitchenMinutes: 10,
  travelMinutes: 25,
  pickupMinutes: 5,
  ...over,
});

function request(body: unknown): Request {
  return new Request('https://example.test/api/settings/branches/delivery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/settings/branches/delivery', () => {
  it('writes the keys the order endpoint prices from', async () => {
    forward.mockReset();
    forward.mockResolvedValue(new Response(null, { status: 200 }));

    await POST(request(panel()) as never);

    expect(forward.mock.calls[0]![1]).toBe('/branches/7');

    const sent = JSON.parse(String(forward.mock.calls[0]![2].body)) as {
      settings: Record<string, number>;
    };

    // The flat names, not `delivery.fee_tiyin`: the dotted path is dropped by
    // the settings schema and read by nothing that charges money.
    expect(sent.settings).toEqual({
      delivery_fee_tiyin: 1_200_000,
      free_delivery_over_tiyin: 0,
      min_order_tiyin: 0,
      // The three the ETA is built from. They were read from paths the schema
      // never declared, so every kitchen promised the same 10 + 25 minutes.
      kitchen_queue_minutes: 10,
      delivery_travel_minutes: 25,
      pickup_wait_minutes: 5,
    });
  });

  it('keeps zero as a real answer', async () => {
    forward.mockReset();
    forward.mockResolvedValue(new Response(null, { status: 200 }));

    // Free delivery, no threshold, no minimum, a pass that never runs behind —
    // settings a restaurant must be able to express, each of them integer zero.
    await POST(request(panel({ feeTiyin: 0, kitchenMinutes: 0 })) as never);

    expect(forward).toHaveBeenCalledOnce();
  });

  it('refuses a fee that is not whole tiyin', async () => {
    forward.mockReset();

    const answer = await POST(request(panel({ feeTiyin: 1_200_000.5 })) as never);

    expect(answer.status).toBe(400);
    expect(forward).not.toHaveBeenCalled();
  });

  it('refuses a fee with three extra zeros', async () => {
    forward.mockReset();

    const answer = await POST(request(panel({ feeTiyin: 900_000_000 })) as never);

    expect(answer.status).toBe(400);
    expect(forward).not.toHaveBeenCalled();
  });

  it('refuses a promise no guest would believe', async () => {
    forward.mockReset();

    // Three hours on the road is a typo, and a guest reads it as a mistake
    // whether or not it was one.
    const answer = await POST(request(panel({ travelMinutes: 180 })) as never);

    expect(answer.status).toBe(400);
    expect(forward).not.toHaveBeenCalled();
  });

  it('refuses a row with no venue behind it', async () => {
    forward.mockReset();

    const answer = await POST(request(panel({ branchId: 0 })) as never);

    expect(answer.status).toBe(400);
    expect(forward).not.toHaveBeenCalled();
  });
});
