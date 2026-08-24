import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * Buying — and giving back — a paid position in the marketplace.
 *
 * Two calls behind one door, the way `/api/platform/billing` carries three: a
 * booking is `POST /api/v1/marketplace/placements` and a release is `DELETE
 * /api/v1/marketplace/placements/{id}`, and apart from the path they are the
 * same request with the same credential and the same envelope back. The action
 * is a key into the table below rather than a fragment taken from the body, so
 * a caller cannot reach a path this file does not name.
 *
 * `DELETE` upstream and a `POST` here, as `tenant-archive` does and for the
 * same reason: the browser half of this console is `lib/console-post.ts`, which
 * posts. A verb is not worth a second client helper that click handlers could
 * forget to catch.
 *
 * ---------------------------------------------------------------------------
 * A slot that is taken is not an error, and the answer says so
 *
 * `409 marketplace.placement_slot_taken` carries `meta.queue_days` — how many
 * days until the position frees. That is a schedule rather than a refusal, and
 * the board reads it to say "queued, four days" instead of "not saved". So the
 * envelope goes back untouched, `meta` and all: re-wording it here would throw
 * away the only number that makes the refusal actionable.
 *
 * ---------------------------------------------------------------------------
 * What is NOT forwarded
 *
 * No price. The day rate is the platform's, published on `GET` beside the slot,
 * and a booking that carried its own would be a merchant naming what their
 * banner costs. The window is `starts_on` plus `days` for the same reason the
 * catalogue is not sent: the server bills per day from its own rate card.
 */
type Action = 'book' | 'release';

type Body = {
  action?: unknown;
  slot?: unknown;
  startsOn?: unknown;
  days?: unknown;
  placementId?: unknown;
};

/** The two positions on sale. A third would be a price list, not a constant. */
const SLOTS: readonly string[] = ['home_top', 'category_top'];

/** Fourteen days is a fortnight's campaign; longer is a standing order. */
const MAX_DAYS = 14;

const isAction = (value: unknown): value is Action => value === 'book' || value === 'release';

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null || !isAction(body.action)) return badRequest('invalid_body');

  if (body.action === 'release') {
    const placement = whole(body.placementId);

    // A fixture slot has no numeric id — the design's card draws three rows
    // whether or not the API answered. Releasing one would cancel whichever
    // real booking happens to hold that id.
    if (placement === null) return badRequest('invalid_placement');

    return forward(request, `/marketplace/placements/${placement}`, { method: 'DELETE' });
  }

  const slot = typeof body.slot === 'string' && SLOTS.includes(body.slot) ? body.slot : null;

  if (slot === null) return badRequest('invalid_slot');

  /*
   * `YYYY-MM-DD`, checked for shape rather than for being in the future. Which
   * day is too late to book is the server's decision — it holds the queue and
   * knows what is already sold — and a browser clock is not a fact about time.
   */
  const startsOn =
    typeof body.startsOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.startsOn)
      ? body.startsOn
      : null;

  if (startsOn === null) return badRequest('invalid_date');

  const days = whole(body.days);

  if (days === null || days > MAX_DAYS) return badRequest('invalid_days');

  return forward(request, '/marketplace/placements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slot, starts_on: startsOn, days }),
  });
}
