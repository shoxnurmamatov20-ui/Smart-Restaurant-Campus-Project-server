import { NextResponse, type NextRequest } from 'next/server';

import { badRequest, jsonBody } from '@/lib/api-proxy';
import { mpForward } from '@/lib/mp-proxy';

/**
 * The three things a marketplace customer can do to an order they already placed.
 *
 * Cancel it, rate it, or say something went wrong with it. One handler rather
 * than three files because they share everything that matters here: the same
 * credential, the same order in the path, and the same rule that this side
 * decides nothing — the API's own ladder says whether a cancellation is still
 * allowed, whether an order has been delivered long enough to rate, and whether
 * a complaint settles itself.
 *
 * All three were flash-only until now. The sheets told a guest their order was
 * cancelled, their refund approved or their stars counted, and the kitchen kept
 * cooking, no dispute row existed for anybody to answer, and the shop's average
 * never moved. A confirmation for something that did not happen is worse than
 * no button.
 *
 * `action` in the body rather than in the path so the three cannot be reached
 * by guessing a URL shape: an unknown verb is refused here, by name, before
 * anything is forwarded.
 */
type Body = {
  action?: unknown;
  /** cancel */
  reason?: unknown;
  /** rate */
  rating?: unknown;
  comment?: unknown;
  /** dispute */
  kind?: unknown;
  amountTiyin?: unknown;
  note?: unknown;
};

/** `Dispute::KINDS` — the four the sheet offers, written out so a fifth cannot arrive. */
const DISPUTE_KINDS: readonly string[] = ['late', 'missing', 'cold', 'wrong'];

const text = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, max) : null;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ number: string }> },
) {
  const { number } = await params;

  // An order number is printed on a receipt and typed by nobody, so anything
  // outside the shape it is minted in is a caller doing something else.
  if (!/^[A-Za-z0-9-]{1,32}$/.test(number)) return badRequest('invalid_order');

  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const path = `/mp/orders/${encodeURIComponent(number)}`;
  const json = (payload: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (body.action === 'cancel') {
    const reason = text(body.reason, 255);

    return mpForward(request, `${path}/cancel`, json(reason === null ? {} : { reason }));
  }

  if (body.action === 'rate') {
    const rating = body.rating;

    // One to five, integer. A rating is what the directory sorts by, so a
    // coerced value here is a shop moved up the list by a malformed request.
    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return badRequest('invalid_rating');
    }

    const comment = text(body.comment, 500);

    return mpForward(
      request,
      `${path}/rate`,
      json({ rating, ...(comment === null ? {} : { comment }) }),
    );
  }

  if (body.action === 'dispute') {
    const kind = typeof body.kind === 'string' ? body.kind : '';

    if (!DISPUTE_KINDS.includes(kind)) return badRequest('invalid_kind');

    const amount = body.amountTiyin;

    // Integer tiyin, never a float. The API clamps it to the order total; what
    // is refused here is the shape, so a fractional som cannot become a refund.
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 0) {
      return badRequest('invalid_amount');
    }

    const note = text(body.note, 2_000);

    return mpForward(
      request,
      `${path}/dispute`,
      json({ kind, amount_tiyin: amount, ...(note === null ? {} : { body: note }) }),
    );
  }

  return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
}
