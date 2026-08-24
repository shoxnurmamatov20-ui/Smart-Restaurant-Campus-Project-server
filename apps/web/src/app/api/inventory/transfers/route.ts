import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * Stock moving from one venue to another.
 *
 * The button on the operations screen's transfer tab, which for a long time
 * could not exist: with one tenant-wide balance the two legs netted to zero on
 * the same row, so the ledger recorded a transfer and the shelf was unchanged —
 * *"worse than the button doing nothing, because it looks like it worked."*
 * `inventory.stock_levels` is what made it postable.
 *
 * The two branch ids are checked here only for being numbers. Whether they
 * exist, whether they belong to this restaurant and whether they are the same
 * venue are all the API's — `StoreStockTransferRequest` refuses a transfer to
 * yourself, and a second copy of that rule here would be the one that goes
 * stale.
 */
type Body = {
  from?: unknown;
  to?: unknown;
  send?: unknown;
  note?: unknown;
  lines?: unknown;
};

type Line = { ingredientId?: unknown; quantity?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const from = whole(body.from);
  const to = whole(body.to);

  if (from === null || to === null) return badRequest('no_venues');
  if (!Array.isArray(body.lines) || body.lines.length === 0) return badRequest('nothing_to_move');

  const lines: { ingredient_id: number; quantity: number }[] = [];

  for (const raw of body.lines as Line[]) {
    const ingredientId = whole(raw.ingredientId);
    const quantity = whole(raw.quantity);

    // A blank row on the form. Skipped rather than refused, like the count
    // sheet: a van of six products must not be thrown away over one of them.
    if (ingredientId === null || quantity === null) continue;

    lines.push({ ingredient_id: ingredientId, quantity });
  }

  if (lines.length === 0) return badRequest('nothing_to_move');

  return forward(request, '/inventory/transfers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from_branch_id: from,
      to_branch_id: to,
      // The screen's one button dispatches; a draft is the API's default-off
      // path and nothing in this console asks for one yet.
      send: body.send !== false,
      note: typeof body.note === 'string' && body.note !== '' ? body.note : null,
      lines,
    }),
  });
}
