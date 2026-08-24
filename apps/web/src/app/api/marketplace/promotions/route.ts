import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * Running an offer again.
 *
 * `POST /api/v1/marketplace/promotions` upstream, and it is a CREATE — which is
 * exactly why the sibling `[promotion]/route.ts` is not a substitute. The
 * module has no duplicate endpoint, so "Yana ishga tushirish" on a finished
 * card assembles a new draft from the old offer's own fields on the client and
 * sends it here. Before this the button was the only primary control on that
 * card and it created nothing: a merchant re-running last month's successful
 * offer got a confirmation and no offer.
 *
 * ---------------------------------------------------------------------------
 * `scheduled`, never `running`
 *
 * A copy starts scheduled. Two reasons and both are money: an offer that went
 * live the instant somebody pressed "again" would start spending against a
 * budget the merchant has not looked at since last month, and the card's own
 * budget sheet — the control that exists to be looked at — is reachable only
 * from a scheduled offer.
 *
 * The budget is required upstream because an offer with no ceiling is the one
 * way a merchant can lose an unbounded amount on this platform. It is required
 * here for the same reason rather than defaulted to the old one silently.
 */
type Body = {
  title?: unknown;
  body?: unknown;
  kind?: unknown;
  discountTiyin?: unknown;
  budgetTiyin?: unknown;
};

/** `Promotion::KINDS`. Written out so a fourth cannot arrive by accident. */
const KINDS: readonly string[] = ['discount', 'free_delivery', 'ad_slot'];

/** A `{uz,ru,en}` column as the API stores it; `uz` is the one that is required. */
function trilingual(value: unknown): { uz: string; ru: string | null; en: string | null } | null {
  if (typeof value !== 'object' || value === null) return null;

  const row = value as Record<string, unknown>;
  const pick = (key: string): string | null =>
    typeof row[key] === 'string' && row[key].trim() !== '' ? row[key].trim().slice(0, 160) : null;

  const uz = pick('uz');

  return uz === null ? null : { uz, ru: pick('ru'), en: pick('en') };
}

/** Whole tiyin, never a float — money is an integer on this platform end to end. */
const tiyin = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const title = trilingual(body.title);

  if (title === null) return badRequest('invalid_title');

  const kind = typeof body.kind === 'string' && KINDS.includes(body.kind) ? body.kind : null;

  if (kind === null) return badRequest('invalid_kind');

  const budget = tiyin(body.budgetTiyin);

  if (budget === null) return badRequest('invalid_budget');

  const discount = tiyin(body.discountTiyin);

  return forward(request, '/marketplace/promotions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      body: trilingual(body.body),
      kind,
      state: 'scheduled',
      budget_tiyin: budget,
      ...(discount === null ? {} : { discount_tiyin: discount }),
    }),
  });
}
