import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * A van arrived and somebody signed for it.
 *
 * The operations screen's receiving tab, which drew the ordered-versus-received
 * table and then confirmed nothing. `POST /api/v1/suppliers/purchase-orders/
 * {purchaseOrder}/receive` is the door and it does three writes at once, inside
 * a transaction: every line raises its ingredient's balance, the order closes,
 * and a supplier who invoices rather than being paid at the door has their debt
 * grown. A console that posted those three separately would be a console that
 * could leave the shelf raised and the order still open.
 *
 * ---------------------------------------------------------------------------
 * What was counted, when somebody counted
 *
 * `lines` is optional and stays optional. A storekeeper signing for a whole
 * document — which is what the phone at the service entrance does — sends none,
 * and every line then keeps a null `received_quantity`, meaning "nobody
 * counted" rather than "all of it arrived".
 *
 * When counts ARE sent, they decide what reaches the shelf: two kilos of beef
 * that never arrived must not appear in stock, because the stock-take three
 * weeks later is where anybody would otherwise find out. What is OWED is
 * untouched either way — the order's total is what the supplier invoiced, and
 * correcting an invoice down is a credit note between two businesses rather
 * than something a tablet decides.
 *
 * Zero is a real count and is passed through: a line that did not come at all
 * is exactly the case the variance column exists for. `whole()` refuses zero,
 * so the quantity is checked here rather than borrowed from it.
 *
 * ---------------------------------------------------------------------------
 * Sibling of `../route.ts` rather than part of it
 *
 * That handler raises an order; this one closes it. One route with a `mode`
 * field would be one door for two acts that need different permissions
 * upstream (`suppliers.create` against `suppliers.update`) and different
 * refusals — "nothing to order" is not "already received".
 */
type Body = { id?: unknown; lines?: unknown };

/** A counted line the API will accept, or null. */
function counted(value: unknown): { id: number; received_quantity: number } | null {
  if (typeof value !== 'object' || value === null) return null;

  const line = value as { id?: unknown; received?: unknown };
  const id = whole(line.id);
  const received = line.received;

  if (id === null) return null;
  if (typeof received !== 'number' || !Number.isInteger(received) || received < 0) return null;

  return { id, received_quantity: received };
}

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const id = whole(body.id);

  /*
   * The deliveries on the demo console are keyed by document number —
   * `INV-4862` — so there is nothing to address. Refused here as well as
   * guarded on the screen: this is the half no browser can skip.
   */
  if (id === null) return badRequest('invalid_purchase_order');

  const lines = Array.isArray(body.lines)
    ? body.lines.map(counted).filter((line) => line !== null)
    : [];

  return forward(request, `/suppliers/purchase-orders/${id}/receive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Omitted rather than sent empty: an empty `lines` and no `lines` mean the
    // same thing upstream, and sending the key would suggest a count was taken.
    body: JSON.stringify(lines.length === 0 ? {} : { lines }),
  });
}
