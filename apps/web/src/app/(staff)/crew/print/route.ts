import { type NextRequest } from 'next/server';

import { crewBadRequest, crewBody, crewForward, crewWhole } from '../../crew-proxy';

/**
 * Bringing the bill — `POST /api/v1/kitchen/receipts`.
 *
 * The one of the five table actions that reaches a printer. A guest has asked
 * for the cheque and the waiter is standing at the table; the job goes on the
 * spooler and the till's own printer produces it, which is what "the cashier
 * has been notified" in the design's confirmation actually means.
 *
 * **`order_id`, not the table.** A table carries several bills at once —
 * `BILLS_PER_TABLE` is four — so a printer asked for "table 12" would have to
 * choose one, and the one it chose would sometimes be the party that already
 * left. The floor read hands the open order's id down with the table for
 * exactly this (`MyTable.orderId`).
 *
 * **`pos.sell`, and that is not an accident of grouping.** The upstream route
 * says why in its own note: a receipt is a money document, and putting it on
 * `kitchen.*` would let anyone with `kitchen.view` — every waiter — produce
 * duplicate receipts for a bill they are carrying, which is the shape of every
 * till fraud there is. A waiter holds `pos.sell` and a cook does not.
 *
 * Not queued offline. A reprint that arrives twenty minutes later, after the
 * table has paid and gone, is a stray cheque on a spool; the honest answer to
 * no signal here is to tell the waiter it did not print.
 */
type Body = { orderId?: unknown };

export async function POST(request: NextRequest) {
  const body = await crewBody<Body>(request);

  if (body === null) return crewBadRequest('invalid_body');

  const orderId = crewWhole(body.orderId);

  // A free table, or a floor drawn from fixtures. Neither has a bill to print,
  // and the screen says so rather than sending an id that names nothing.
  if (orderId === null) return crewBadRequest('no_open_bill');

  return crewForward(request, '/kitchen/receipts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: orderId }),
  });
}
