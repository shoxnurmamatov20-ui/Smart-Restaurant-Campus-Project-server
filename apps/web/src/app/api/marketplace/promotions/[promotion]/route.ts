import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * Changing an offer that already exists.
 *
 * `PATCH /api/v1/marketplace/promotions/{id}` upstream. Four buttons on the
 * promotions card reach this one route — pause, resume, cancel, re-budget —
 * because all four are the same request: move `state` along, or move the
 * ceiling, on a row the merchant already owns.
 *
 * **The module's `POST` is not a stand-in for any of them and never was.** It
 * creates, and `budget_tiyin` is required on it because an offer with no
 * ceiling is the one way a merchant can lose an unbounded amount here. Pausing
 * through a create would leave the running offer running and add a second one
 * beside it; re-budgeting through one would leave two offers on the same three
 * days, each holding its own budget.
 *
 * ---------------------------------------------------------------------------
 * Two refusals the screen has to keep apart
 *
 * `marketplace.promotion_transition` (409) is a state that cannot be reached
 * from this one — resuming something already ended. `marketplace.budget_below
 * _spend` (422) is a ceiling under what the offer has already paid out, which
 * would make the remaining budget negative. Both are passed through with their
 * own sentence rather than flattened into "not saved": the first means "reload
 * this screen", the second means "type a bigger number", and a merchant told
 * the wrong one presses the same button again.
 */
type Body = { state?: unknown; budgetTiyin?: unknown };

/** The four a merchant may ask for. `draft` is not one — nothing goes back. */
const STATES: readonly string[] = ['running', 'paused', 'cancelled', 'ended'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ promotion: string }> },
) {
  const { promotion } = await params;

  /*
   * Checked here as well as upstream: the board draws the design's three
   * sample offers when the API cannot answer, and those carry `p1`, `p2`, `p3`.
   * A tap on one would otherwise come back as a 404 the merchant would read as
   * the platform having lost their campaign.
   */
  if (!/^\d+$/.test(promotion)) return badRequest('invalid_promotion');

  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const state = typeof body.state === 'string' && STATES.includes(body.state) ? body.state : null;

  /*
   * Whole tiyin only, and a ceiling rather than a change. Money is an integer
   * on this platform end to end (1 so'm = 100 tiyin), and a float arriving here
   * would be rounded by whichever layer noticed first.
   */
  const budget =
    typeof body.budgetTiyin === 'number' &&
    Number.isInteger(body.budgetTiyin) &&
    body.budgetTiyin > 0
      ? body.budgetTiyin
      : null;

  // An empty PATCH is not a no-op worth forwarding — it is a bug in the caller,
  // and answering 200 to one would have a button that quietly did nothing.
  if (state === null && budget === null) return badRequest('nothing_to_change');

  return forward(request, `/marketplace/promotions/${promotion}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(state === null ? {} : { state }),
      ...(budget === null ? {} : { budget_tiyin: budget }),
    }),
  });
}
