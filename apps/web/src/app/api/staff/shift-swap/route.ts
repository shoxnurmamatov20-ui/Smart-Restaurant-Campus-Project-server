import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * A manager's verdict on somebody asking to be let off a shift.
 *
 * Two verdicts and no third: approving hands the shift over and rejecting
 * leaves it where it is, and both stay as history — the person who asked can
 * still see what was decided a month later. Withdrawing a request is a
 * different act with its own route upstream, because "I changed my mind" and
 * "the answer is no" are not the same fact about a Saturday.
 *
 * Approving needs somebody to hand the shift to. Most requests arrive open —
 * "can anybody take Thursday" — so the taker is usually chosen here, by the
 * manager, and the API refuses an approval without one: a shift that changed
 * hands to nobody is a gap that reads as covered.
 */
type Body = {
  swapId?: unknown;
  verdict?: unknown;
  takerId?: unknown;
  note?: unknown;
  /** Set instead of `swapId` to RAISE a request rather than decide one. */
  shiftId?: unknown;
  reason?: unknown;
};

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  /*
   * Raising a request, when the body names a shift instead of a swap.
   *
   * Two acts on one route because they are two ends of the same object and the
   * screen that decides is the screen that asks — the rota board. What is NOT
   * shared is what they are addressed by: a verdict names the request, and a
   * request names the SHIFT. One person, one day, one slot; the form used to
   * collect a weekday heading, and «Payshanba» names a different Thursday every
   * week.
   *
   * No `offered_to_id`. Most requests are open — "can anybody take Thursday" —
   * and the taker is chosen by the manager at approval, which is where the API
   * insists on one.
   */
  const shiftId = whole(body.shiftId);

  if (shiftId !== null) {
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    return forward(request, '/staff/shift-swaps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shift_id: shiftId,
        reason: reason === '' ? null : reason.slice(0, 255),
      }),
    });
  }

  const swapId = whole(body.swapId);
  const verdict = body.verdict === 'approve' || body.verdict === 'reject' ? body.verdict : null;

  /*
   * Checked here as well as upstream, because the queue carries fixture rows
   * with non-numeric ids. Without this a tap on the demo board would reach the
   * API and come back as a 404 the screen would show as a real failure.
   */
  if (swapId === null) return badRequest('invalid_swap');
  if (verdict === null) return badRequest('invalid_verdict');

  return forward(request, `/staff/shift-swaps/${swapId}/${verdict}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      offered_to_id: whole(body.takerId),
      note: typeof body.note === 'string' && body.note !== '' ? body.note : null,
    }),
  });
}
