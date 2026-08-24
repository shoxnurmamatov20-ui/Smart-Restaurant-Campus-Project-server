import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * An order raised, from either of the two places a person raises one.
 *
 * The store screen's per-row "order" button posts a single line against the
 * shelf that is running low; the suppliers screen's "new order" tab posts a
 * whole basket. One route, because they produce the same document — and the
 * order book on the suppliers screen reads that same table back.
 *
 * Both land as a draft unless the caller says otherwise. That is the control:
 * an order that left the building the instant somebody tapped a row would be an
 * order nobody checked, and the ladder (`draft → sent → confirmed`) exists so a
 * person does.
 *
 * The document number is deliberately not sent. The API takes it from the
 * branch counter, which is the only place this platform issues numbers — two
 * buyers on two screens would otherwise invent the same one.
 */
type Body = {
  supplierId?: unknown;
  expectedAt?: unknown;
  status?: unknown;
  note?: unknown;
  items?: unknown;
};

type Line = {
  ingredientId?: unknown;
  name?: unknown;
  unit?: unknown;
  /** Base units. */
  quantity?: unknown;
  /** Tiyin per base unit. */
  unitPrice?: unknown;
};

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const supplierId = whole(body.supplierId);

  if (supplierId === null) return badRequest('invalid_supplier');

  const items: {
    ingredient_id: number | null;
    name: string;
    unit: string | null;
    quantity: number;
    unit_price: number;
  }[] = [];

  for (const raw of Array.isArray(body.items) ? (body.items as Line[]) : []) {
    const quantity = whole(raw.quantity);
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    const unitPrice =
      typeof raw.unitPrice === 'number' && raw.unitPrice >= 0 ? Math.round(raw.unitPrice) : null;

    if (quantity === null || name === '' || unitPrice === null) continue;

    items.push({
      // Null rather than skipped: a line for something that is not on the shelf
      // yet — packaging, a new product — is still a line a supplier delivers.
      // It simply will not raise stock when the delivery is received.
      ingredient_id: whole(raw.ingredientId),
      name,
      unit: typeof raw.unit === 'string' && raw.unit !== '' ? raw.unit : null,
      quantity,
      unit_price: unitPrice,
    });
  }

  if (items.length === 0) return badRequest('nothing_to_order');

  return forward(request, '/suppliers/purchase-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      supplier_id: supplierId,
      status: body.status === 'sent' ? 'sent' : 'draft',
      expected_at: typeof body.expectedAt === 'string' ? body.expectedAt : null,
      note: typeof body.note === 'string' && body.note !== '' ? body.note : null,
      items,
    }),
  });
}
