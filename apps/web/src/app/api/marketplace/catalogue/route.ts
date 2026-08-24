import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * What goes in the shop window, and what it costs there.
 *
 * `PATCH /api/v1/marketplace/catalogue` upstream, and it is a batch because the
 * screen is a table somebody edits and then saves: one request per row would
 * make "re-price these nine dishes" nine chances to fail halfway and leave the
 * window half dressed. The same door takes a single row, which is what the
 * visibility switch sends — a dish that has just run out must not wait for the
 * merchant to press anything else.
 *
 * ---------------------------------------------------------------------------
 * The price goes up, the markup is what is stored
 *
 * The endpoint accepts either `markup_tiyin` or `market_price_tiyin` and this
 * sends the second, because that is the number the merchant typed and the one
 * the card shows. The API converts it against today's house price and stores
 * the difference, so a dish that gets dearer in the dining room stays dearer on
 * the marketplace instead of quietly losing its uplift.
 *
 * Money is integer tiyin the whole way. The board edits in so'm because that is
 * what a person types, multiplies before it leaves the browser, and nothing
 * here divides — a price that made a round trip through a float is a price that
 * arrives one tiyin short.
 */
type Body = { items?: unknown };

type Row = { menuItemId?: unknown; marketPriceTiyin?: unknown; isListed?: unknown };

/** The API's own ceiling. Longer than this is a script rather than a menu. */
const MAX_ITEMS = 300;

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null || !Array.isArray(body.items) || body.items.length === 0) {
    return badRequest('invalid_body');
  }

  const items: { menu_item_id: number; market_price_tiyin?: number; is_listed?: boolean }[] = [];

  for (const raw of (body.items as Row[]).slice(0, MAX_ITEMS)) {
    const menuItemId = whole(raw.menuItemId);

    /*
     * A dish the board is drawing from the design's sample, which carries `d1`
     * and `d2`. Skipped rather than refused: a save of forty rows must not be
     * thrown away over one of them, and the rows that ARE real still land.
     */
    if (menuItemId === null) continue;

    const price =
      typeof raw.marketPriceTiyin === 'number' &&
      Number.isInteger(raw.marketPriceTiyin) &&
      raw.marketPriceTiyin >= 0
        ? raw.marketPriceTiyin
        : null;

    items.push({
      menu_item_id: menuItemId,
      ...(price === null ? {} : { market_price_tiyin: price }),
      ...(typeof raw.isListed === 'boolean' ? { is_listed: raw.isListed } : {}),
    });
  }

  if (items.length === 0) return badRequest('nothing_to_save');

  return forward(request, '/marketplace/catalogue', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
}
