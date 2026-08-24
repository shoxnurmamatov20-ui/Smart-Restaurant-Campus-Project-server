import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * A supplier invoice, settled.
 *
 * `{ id: 41 }` becomes `POST /api/v1/suppliers/purchase-orders/41/pay`.
 * Proxied for the reason everything that writes here is proxied: the session
 * token is an httpOnly cookie the browser cannot read, so the books screen
 * cannot ask Laravel itself — and the reader's own token goes up, so the API
 * decides on `suppliers.manage` against the person actually clicking and the
 * audit row names them.
 *
 * ---------------------------------------------------------------------------
 * The id is checked against a digit pattern rather than passed through
 *
 * It comes from a rendered row today. A handler that interpolates whatever it
 * is handed can be aimed at any endpoint the reader's token happens to reach,
 * and this one interpolates into a path with a verb on the end.
 *
 * ---------------------------------------------------------------------------
 * No amount, deliberately
 *
 * `amount` is optional upstream and absent means "all of it", worked out under
 * a row lock. Sending the figure the screen rendered would be sending a number
 * that was true a minute ago: two people settling the same invoice would have
 * the second payment refused as an overpayment rather than recognised as the
 * duplicate it is, and a part payment made from the till in between would make
 * the console's figure simply wrong. The console has no part-payment control,
 * so it has nothing to say about the amount — and saying nothing is the only
 * version of that which cannot go stale.
 *
 * `note` is not forwarded either. The design's control is a button, not a
 * form; a note the screen never collected would be a field invented here.
 */
type Body = { id?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const id = whole(body.id);

  /*
   * The demo book keys its payables `a1`, `a2` — there is nothing to address.
   * Refused here as well as guarded on the screen: this is the half no browser
   * can skip.
   */
  if (id === null) return badRequest('invalid_purchase_order');

  return forward(request, `/suppliers/purchase-orders/${id}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}
