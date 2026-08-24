import { type NextRequest, type NextResponse } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * The one write behind the ninety-second queue.
 *
 * `PATCH /api/v1/marketplace/orders/{id}` upstream, and it is the only endpoint
 * that moves a marketplace order at all — accept, refuse, ready and handed over
 * are all this call with a different rung in the body. The ladder
 * (`MarketOrderState::canBecome()`) decides which of them is legal from where,
 * so nothing here re-states it: a second copy of a nine-rung table is a table
 * that parts company with the first one the day a rung is added.
 *
 * ---------------------------------------------------------------------------
 * Four rungs the panel may send, and the five it may not
 *
 * The allow-list is short on purpose. `delivered` and `enroute` belong to the
 * courier — a merchant who could mark their own order delivered would be
 * closing the bill for food still on a bicycle — and `cancelled` is a different
 * fact from `rejected` on the performance report the platform judges them by.
 * `cooking` is absent from the list because nobody presses it; see below.
 *
 * ---------------------------------------------------------------------------
 * Accepting is two rungs, and the second one is not a shortcut
 *
 * `accepted` is what opens the bill and fires the kitchen docket, so the moment
 * a merchant says yes the food is on a pass — which is why the panel's chip for
 * an accepted order already reads "Tayyorlanmoqda". The server keeps `accepted`
 * and `cooking` apart because it measures the gap between them, but the ladder
 * only allows `ready` from `cooking`, so an order left sitting at `accepted`
 * would refuse the very next button the merchant presses.
 *
 * So one press walks both. The second call is skipped when the first is
 * refused, and its own failure is returned rather than swallowed: an order that
 * reached `accepted` and stopped is still an accepted order, and the panel has
 * to be told the difference.
 */
type Body = { state?: unknown; reason?: unknown; etaMinutes?: unknown };

/**
 * What a merchant's four buttons mean, in the server's own vocabulary.
 *
 * A `Set` rather than a union type because the value arrives as JSON from a
 * browser: the type would be erased and the check has to survive to runtime.
 */
const MERCHANT_MAY_SEND = new Set(['accepted', 'rejected', 'ready', 'courier_assigned']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ order: string }> },
) {
  const { order } = await params;

  /*
   * Checked here as well as upstream, because the queue draws the design's
   * sample rows when the API cannot answer and those carry `o1`, `o2`. Without
   * this a tap on a demo card would reach the API and come back as a 404 the
   * merchant would read as a real refusal.
   */
  if (!/^\d+$/.test(order)) return badRequest('invalid_order');

  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  /*
   * The "+5 minutes" button, which moves nothing on the ladder.
   *
   * Sent on its own, without a rung: the food is still cooking and the only
   * thing that changed is what the restaurant now promises. It used to update a
   * local map and flash the new total, so the merchant believed the guest had
   * been told and the guest's ETA never moved — which is the whole point of the
   * control. Four hours is the API's ceiling and it is repeated here so a
   * malformed value fails by name rather than as a 422 the panel cannot word.
   */
  if (body.state === undefined && body.etaMinutes !== undefined) {
    const minutes = body.etaMinutes;

    if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1 || minutes > 240) {
      return badRequest('invalid_eta');
    }

    return forward(request, `/marketplace/orders/${order}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eta_minutes: minutes }),
    });
  }

  const state =
    typeof body.state === 'string' && MERCHANT_MAY_SEND.has(body.state) ? body.state : null;

  if (state === null) return badRequest('invalid_state');

  /*
   * A key from `REJECT_REASONS` rather than the sentence the merchant read.
   * The column is quoted back in a dispute months later and read by somebody
   * whose language is not necessarily the one the panel was in.
   */
  const reason =
    typeof body.reason === 'string' && body.reason !== '' ? body.reason.slice(0, 255) : null;

  const answered = await rung(request, order, state, reason);

  if (state !== 'accepted' || !answered.ok) return answered;

  return rung(request, order, 'cooking', null);
}

/** One step of the ladder, with the person's own token and a fresh key. */
function rung(
  request: NextRequest,
  order: string,
  state: string,
  reason: string | null,
): Promise<NextResponse> {
  return forward(request, `/marketplace/orders/${order}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, reason }),
  });
}
