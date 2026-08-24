import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * Something the restaurant bought once and will use for years.
 *
 * `POST /api/v1/finance/fixed-assets`. Proxied so `finance.manage` is decided
 * against the reader's own token rather than the console's.
 *
 * ---------------------------------------------------------------------------
 * A named allowlist, not a passthrough
 *
 * The register decides how much of a purchase reaches this month's P&L and how
 * much sits on the balance sheet — the whole reason the tab exists. Upstream
 * accepts `residual` and `disposed_on` as well; neither is sent, because the
 * screen collects neither. `residual` would contradict the method note printed
 * beside the table, which says straight-line down to zero, and `disposed_on`
 * would let an asset be written off in the same request that created it.
 * Forwarding whatever key a browser happened to send would make both reachable
 * from a form that draws neither.
 *
 * ---------------------------------------------------------------------------
 * The category is checked against the list, not the API's refusal
 *
 * `FixedAsset::CATEGORIES` is four words and the validator would reject a fifth
 * anyway. Checking here is not distrust of upstream — it is so the console
 * fails with a reason of its own rather than surfacing a validation envelope
 * for a field the reader picked from a closed dropdown, which can only mean the
 * two lists have drifted apart.
 */
const CATEGORIES = new Set(['equipment', 'furniture', 'fit_out', 'vehicle']);

/** Upstream's `max:160` on the name and `max:600` on the life, in months. */
const NAME_MAX = 160;
const LIFE_MAX = 600;

type Body = {
  name?: unknown;
  category?: unknown;
  /** `YYYY-MM-DD`, which is what a date input hands over. */
  acquiredOn?: unknown;
  /** Integer tiyin. The form takes so'm and converts once, in the browser. */
  costTiyin?: unknown;
  /** Months. The form takes years and multiplies once, in the browser. */
  usefulLifeMonths?: unknown;
};

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (name === '') return badRequest('invalid_name');

  const category = typeof body.category === 'string' ? body.category : '';

  if (!CATEGORIES.has(category)) return badRequest('invalid_category');

  const acquiredOn = typeof body.acquiredOn === 'string' ? body.acquiredOn : '';

  /*
   * The shape, not the calendar. `2026-02-31` passes this and is refused
   * upstream by `date`, which is the right division of labour: this handler
   * owns the argument's form, the API owns whether the day exists.
   */
  if (!/^\d{4}-\d{2}-\d{2}$/.test(acquiredOn)) return badRequest('invalid_date');

  const cost = whole(body.costTiyin);

  if (cost === null) return badRequest('invalid_cost');

  const life = whole(body.usefulLifeMonths);

  if (life === null || life > LIFE_MAX) return badRequest('invalid_life');

  return forward(request, '/finance/fixed-assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: name.slice(0, NAME_MAX),
      category,
      acquired_on: acquiredOn,
      cost,
      useful_life_months: life,
      /*
       * No `branch_id`, and that is what the fixture's own register already
       * says: an asset with no branch reads "all branches", which is the
       * honest answer from a console that has no branch picker on this form.
       * Stamping the reader's current branch instead would put a group-wide
       * delivery van on whichever venue the person happened to be looking at.
       */
    }),
  });
}
