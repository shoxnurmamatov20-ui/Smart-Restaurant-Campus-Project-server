import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * A dish edited: its three names, its price and what it costs to make.
 *
 * The menu screen's editor drawer, which validated four fields and then posted
 * none of them. `PATCH /api/v1/menu/items/{item}` has been there the whole
 * time; what the drawer could not do is reach it, because the session token is
 * an httpOnly cookie the browser cannot read — so this handler forwards the
 * manager's own token and the API decides `menu.update` against the person who
 * actually pressed Save.
 *
 * A POST from the browser and a PATCH upstream, which is the house rule for
 * every write in this console: one verb on this side keeps `console-post.ts`
 * to one function, and the upstream verb is a fact about the API rather than
 * about the button.
 *
 * ---------------------------------------------------------------------------
 * Three names, sent together, always
 *
 * `name` is a jsonb column and the API replaces it wholesale — `{uz}` alone
 * would silently drop the Russian and English a marketer typed last month, and
 * a dish with an empty `ru` renders as a blank row on half the guest surfaces.
 * So the drawer opens with all three filled from `MenuScreenRow.names` and
 * sends all three back. A blank field is sent as `null` rather than `""`,
 * because "this dish has no English name" and "somebody saved an empty string"
 * read the same on the shelf and only the first is a fact.
 *
 * ---------------------------------------------------------------------------
 * Money arrives in tiyin
 *
 * The drawer types so'm — that is how a price is spoken — and multiplies once,
 * on its side, next to the field. Doing it here as well would be two roundings
 * of one figure, which is the drift `pricing.ts` already warns about in as many
 * words.
 *
 * `cost_price` above `price` is refused upstream rather than here, deliberately:
 * the API's refusal carries a code and a sentence in three languages, and the
 * drawer shows that sentence. A second copy of the rule in this file would be
 * a second thing to keep in step with the one on the server.
 */
type Body = {
  id?: unknown;
  /** `{uz, ru, en}` — all three, whatever the reader's own language is. */
  names?: unknown;
  /** Tiyin. */
  price?: unknown;
  /** Tiyin. */
  cost?: unknown;
};

/** A name field: trimmed, or null when it was left blank. */
function label(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';

  return text === '' ? null : text;
}

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const id = whole(body.id);

  /*
   * Checked here as well as upstream, because the menu fixtures are keyed by
   * name — `osh`, `lagmon`, `somsa`. Without this a save on the demo console
   * would reach the API as `/menu/items/osh` and come back a 404 the drawer
   * would show as a real failure. The screen guards it too, with `apiId`; this
   * is the half that cannot be skipped by anything the browser sends.
   */
  if (id === null) return badRequest('invalid_item');

  const names = (body.names ?? {}) as Record<string, unknown>;
  const uz = label(names.uz);

  // The one required name, and the API says so too (`required_with:name`). A
  // dish with no Uzbek name has no name at all on the surfaces most guests use.
  if (uz === null) return badRequest('name_required');

  const price = whole(body.price);

  if (price === null) return badRequest('invalid_price');

  const cost =
    typeof body.cost === 'number' && Number.isInteger(body.cost) && body.cost >= 0
      ? body.cost
      : null;

  return forward(request, `/menu/items/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: { uz, ru: label(names.ru), en: label(names.en) },
      price,
      // Null is a real value here: a dish nobody has costed yet reports no
      // margin rather than a 100% one, and the column is nullable for that.
      cost_price: cost,
    }),
  });
}
