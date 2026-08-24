import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * Something left the shelf and it was not a sale.
 *
 * The expiry panel's "write off" button and the operations tab's waste form,
 * which between them collected a batch, a quantity and a reason and posted none
 * of it. One route for both, because they are one movement: `write_off`, with
 * the reason attached — unexplained shrinkage is the thing the stock module
 * exists to surface, so the API refuses a write-off without one and this passes
 * that refusal straight through.
 *
 * Quantities arrive in BASE units. The screen divides for display and multiplies
 * back before it posts, in one place, because two roundings of the same figure
 * drift apart.
 */
type Body = {
  ingredientId?: unknown;
  /** Base units, positive — the direction is this route's, not the caller's. */
  quantity?: unknown;
  reason?: unknown;
  reference?: unknown;
};

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const ingredientId = whole(body.ingredientId);
  const quantity = whole(body.quantity);
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  /*
   * Checked here as well as upstream, because the fixture shelf carries
   * non-numeric ids — `beef`, `rice`. Without this a tap on the demo board
   * would reach the API and come back as a validation error the screen would
   * show as a real failure.
   */
  if (ingredientId === null) return badRequest('invalid_ingredient');
  if (quantity === null) return badRequest('invalid_quantity');
  if (reason === '') return badRequest('reason_required');

  return forward(request, `/inventory/ingredients/${ingredientId}/movements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'write_off',
      // Negative: this route takes stock off, and the sign is not the caller's
      // to choose.
      quantity: -quantity,
      reason,
      reference:
        typeof body.reference === 'string' && body.reference !== '' ? body.reference : null,
    }),
  });
}
