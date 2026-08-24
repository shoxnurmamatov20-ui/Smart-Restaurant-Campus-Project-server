import { type NextRequest } from 'next/server';

import { crewBadRequest, crewBody, crewForward, crewWhole } from '../../crew-proxy';

/**
 * A reorder raised from a phone — `POST /api/v1/suppliers/purchase-orders`.
 *
 * The More menu's reorder sheet has drawn five rows with steppers and a running
 * total since the surface existed, and it sent nothing: the endpoint needs a
 * **supplier id** and an **ingredient id per line**, and the sheet held `p1`…`p5`
 * from a design file. `crewSuppliers()` and `pricedShelf()` are the reads that
 * closed that gap; this is the door the finished sheet goes through.
 *
 * ---------------------------------------------------------------------------
 * `draft`, never `sent`
 *
 * The endpoint accepts either and this handler hard-codes the first. A
 * storekeeper at a service entrance is raising a *request* — "we are out of
 * lamb" — and the person who decides whether this restaurant buys twenty-five
 * kilos of lamb this week is a manager looking at a bank balance. A phone that
 * could post `sent` would put ordering authority on every handset in the
 * building, and the sheet's own note has always said a manager confirms it.
 *
 * ---------------------------------------------------------------------------
 * The price is the shelf's, not the phone's
 *
 * `unit_price` comes off `IngredientResource.price_tiyin`, which is what the
 * restaurant last paid, and the sheet only shows it. Letting the handset name a
 * price would make the running total on screen and the document's total two
 * different numbers with nobody able to say which the supplier will invoice
 * against — and it is the total a manager approves.
 *
 * Not queued, deliberately: this is the one crew write with no offline story.
 * A purchase order raised twice is stock ordered twice, and unlike a clock-in
 * there is no natural key that would let the server collapse the pair. The
 * sheet asks for a network and says so when there is none.
 */

type Line = { ingredientId?: unknown; name?: unknown; unit?: unknown; quantity?: unknown };

type Incoming = { supplierId?: unknown; lines?: unknown; note?: unknown };

/** A sheet is five rows on a phone; the API's own ceiling is two hundred. */
const MAX_LINES = 60;

export async function POST(request: NextRequest) {
  const body = await crewBody<Incoming>(request);

  if (body === null) return crewBadRequest('invalid_body');

  const supplierId = crewWhole(Number(body.supplierId));

  if (supplierId === null) return crewBadRequest('supplier_required');

  if (!Array.isArray(body.lines)) return crewBadRequest('nothing_to_order');

  const items: {
    ingredient_id: number;
    name: string;
    unit: string;
    quantity: number;
    unit_price: number;
  }[] = [];

  for (const raw of (body.lines as Line[]).slice(0, MAX_LINES)) {
    const ingredientId = crewWhole(Number(raw.ingredientId));
    const quantity = crewWhole(Number(raw.quantity));
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 160) : '';

    /*
     * Dropped rather than refused — a row left at zero is the ordinary way this
     * sheet is used: it opens on the suggested quantities and a storekeeper
     * zeroes the two they do not need. Refusing the request over one of them
     * would make the screen unusable in its normal state.
     */
    if (ingredientId === null || quantity === null || name === '') continue;

    items.push({
      ingredient_id: ingredientId,
      name,
      unit: typeof raw.unit === 'string' ? raw.unit.slice(0, 8) : '',
      quantity,
      /*
       * Zero, always, and the server prices the line from the ingredient.
       *
       * The API takes `unit_price` as required and allows zero — "a supplier
       * does throw in a sample crate". A draft raised from a phone carries no
       * agreed price at all, and sending the shelf's last cost as though it
       * were one would put a number on a document a manager signs.
       */
      unit_price: 0,
    });
  }

  if (items.length === 0) return crewBadRequest('nothing_to_order');

  return crewForward(request, '/suppliers/purchase-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      supplier_id: supplierId,
      status: 'draft',
      note: typeof body.note === 'string' ? body.note.slice(0, 2000) : undefined,
      items,
    }),
  });
}
