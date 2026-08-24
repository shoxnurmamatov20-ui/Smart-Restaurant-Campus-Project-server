import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * What a venue charges to deliver.
 *
 * `PATCH /api/v1/branches/{branch}` with three keys in `settings`, and the
 * names matter more than usual: they are the ones `PublicOrderController`
 * enforces when it prices an order — `delivery_fee_tiyin`,
 * `free_delivery_over_tiyin`, `min_order_tiyin`.
 *
 * They were undeclared in `config/settings.php`, which validates the settings
 * document and drops an undeclared path silently, and the public branch list
 * quoted a *different* pair of paths (`delivery.fee_tiyin`,
 * `delivery.min_order_tiyin`). So there was no way for a restaurant to set a
 * delivery fee at all: the write was discarded, the storefront quoted zero and
 * the bill charged whatever a seeder had left behind. `PublicBranchesTest`
 * reads the quote and the charge out of one row now, and this handler writes
 * the side that is charged.
 *
 * The controller MERGES settings rather than replacing them, so saving this
 * panel does not blank the opening hours the venue trades on.
 */
/** A fee larger than 100 000 so'm is a typo; the schema refuses it too. */
const MAX_FEE_TIYIN = 10_000_000;
/** A basket floor or a free-delivery threshold, up to 10 million so'm. */
const MAX_BASKET_TIYIN = 1_000_000_000;

/** Longer than two hours is a typo, and a guest reads it as one. */
const MAX_MINUTES = 120;

type Body = {
  branchId?: unknown;
  feeTiyin?: unknown;
  freeOverTiyin?: unknown;
  minimumTiyin?: unknown;
  kitchenMinutes?: unknown;
  travelMinutes?: unknown;
  pickupMinutes?: unknown;
};

/**
 * Tiyin, and zero is a real answer.
 *
 * Zero fee is free delivery, zero threshold is "never free", zero minimum is
 * "any basket". None of them may be turned into "unset" — a control that
 * cannot express free delivery is a control a restaurant works around by
 * pricing it into the food.
 */
function amount(value: unknown, ceiling: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null;

  return value > ceiling ? null : value;
}

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const branchId = amount(body.branchId, Number.MAX_SAFE_INTEGER);

  if (branchId === null || branchId === 0) return badRequest('invalid_branch');

  const fee = amount(body.feeTiyin, MAX_FEE_TIYIN);
  const freeOver = amount(body.freeOverTiyin, MAX_BASKET_TIYIN);
  const minimum = amount(body.minimumTiyin, MAX_BASKET_TIYIN);

  if (fee === null || freeOver === null || minimum === null) return badRequest('invalid_amount');

  /*
   * The two halves of what a guest is promised: how far the pass is running
   * behind and how long the trip takes. `etaMinutes()` adds them to the slowest
   * dish, and they were unreachable — every kitchen promised the same 10 + 25.
   */
  const kitchen = amount(body.kitchenMinutes, MAX_MINUTES);
  const travel = amount(body.travelMinutes, MAX_MINUTES);
  const pickup = amount(body.pickupMinutes, MAX_MINUTES);

  if (kitchen === null || travel === null || pickup === null) return badRequest('invalid_minutes');

  return forward(request, `/branches/${branchId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      settings: {
        delivery_fee_tiyin: fee,
        free_delivery_over_tiyin: freeOver,
        min_order_tiyin: minimum,
        kitchen_queue_minutes: kitchen,
        delivery_travel_minutes: travel,
        pickup_wait_minutes: pickup,
      },
    }),
  });
}
