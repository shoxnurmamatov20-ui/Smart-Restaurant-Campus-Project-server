import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * Creating a prep card — `POST /api/v1/inventory/prep-items`.
 *
 * Not `POST /api/inventory/prep` next door, and the difference is the whole
 * reason this file exists: that one is PRODUCTION — a card and a number of
 * batches — and its route says so in as many words. This one writes the card
 * itself, which changes what every dish containing it costs.
 *
 * The checks below duplicate the API's, deliberately. A form that has drifted
 * from the server's rules should fail with a named reason the panel can word,
 * rather than with a 422 whose field path the panel would have to parse. What
 * it does NOT do is invent anything: `on_hand` is absent because stock arrives
 * by being received or produced, both of which write a movement, and a starting
 * balance typed into a form is stock the ledger has never heard of.
 */
type Body = {
  code?: unknown;
  name?: unknown;
  unit?: unknown;
  batchQuantity?: unknown;
  lossPercent?: unknown;
  shelfLifeDays?: unknown;
  components?: unknown;
};

/** `PrepItem::UNITS` — base units only, never a purchase unit. */
const UNITS: readonly string[] = ['g', 'ml'];

const trimmed = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** A whole number in range, or null. `whole()` refuses zero, which loss allows. */
function bounded(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const code = trimmed(body.code).toLowerCase();
  const name = trimmed(body.name);
  const unit = trimmed(body.unit);
  const batch = whole(body.batchQuantity);
  const loss = bounded(body.lossPercent, 0, 90);
  const shelf = bounded(body.shelfLifeDays, 0, 365);

  // The short name a recipe line refers to. Lowercase and hyphenated, so a
  // card written as "Zirvak " and one as "zirvak" cannot become two cards.
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(code) || code.length > 32) return badRequest('invalid_code');
  if (name.length < 2 || name.length > 120) return badRequest('invalid_name');
  if (!UNITS.includes(unit)) return badRequest('invalid_unit');
  if (batch === null || batch > 1_000_000) return badRequest('invalid_batch');
  // 100% loss is a typo the yield would divide by; the API stops at 90 too.
  if (loss === null) return badRequest('invalid_loss');
  if (shelf === null) return badRequest('invalid_shelf_life');

  const rows = Array.isArray(body.components) ? body.components : [];
  const components: { ingredient_id: number; quantity: number }[] = [];

  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;

    const line = row as { ingredientId?: unknown; quantity?: unknown };
    const ingredientId = whole(line.ingredientId);
    const quantity = whole(line.quantity);

    if (ingredientId === null || quantity === null) continue;

    components.push({ ingredient_id: ingredientId, quantity });
  }

  // A card with no components cannot be produced — the API refuses it with
  // `stock.prep_card_empty` — so accepting one here would be accepting a row
  // whose only possible future is an error message.
  if (components.length === 0) return badRequest('no_components');

  return forward(request, '/inventory/prep-items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      /*
       * One name in three fields.
       *
       * The column is `{uz, ru, en}` and the form asks once, because a cook
       * naming a batch of dough writes one word and would leave two boxes
       * empty. Copying it is what stops a Russian console reading a blank
       * where the card's name should be — the alternative is a fallback chain
       * in every reader.
       */
      name: { uz: name, ru: name, en: name },
      unit,
      batch_quantity: batch,
      loss_percent: loss,
      shelf_life_days: shelf,
      components,
    }),
  });
}
