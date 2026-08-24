import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * Money out of the drawer and into the safe.
 *
 * Finance's door rather than the POS one, and the choice matters.
 * `POST /pos/drawer/movements` writes the same ledger entry — both end in
 * `TillLedger::recordCashOut()` — but it sits behind `RequireTerminalSession`,
 * so it wants a POS session token minted at a paired till by
 * `POST /pos/auth/pin`. The console has a back-office sanctum token and no
 * terminal, so that route answers `pos.session_required` to every request the
 * till screen could make. `POST /finance/shifts/{id}/collection` takes
 * `finance.update` and returns the recomputed expected cash in the same reply.
 *
 * The trade is real and worth stating: the POS route additionally records which
 * terminal and which session the drop came from, and this one cannot. A drop
 * taken at the till should be taken at the till.
 *
 * `reason` is required upstream, minimum three characters, and it is the only
 * thing that tells one payout from another afterwards — the ledger stores every
 * cash-out as an `other` expense whose description is this string.
 */
type Body = {
  shiftId?: unknown;
  /** Integer tiyin. The browser converts from so'm; nothing here re-does it. */
  amountTiyin?: unknown;
  reason?: unknown;
};

/** Upstream's own bound, so a long note is refused here rather than at Laravel. */
const REASON_MAX = 255;

const REASON_MIN = 3;

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const shiftId = whole(body.shiftId);

  if (shiftId === null) return badRequest('invalid_shift');

  const amount = whole(body.amountTiyin);

  if (amount === null) return badRequest('invalid_amount');

  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  if (reason.length < REASON_MIN) return badRequest('invalid_reason');

  return forward(request, `/finance/shifts/${shiftId}/collection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    /*
     * A sum, not a note breakdown. The endpoint takes `denominations` too and
     * prefers them when present — that is the right shape for a drop counted
     * note by note at the till, and it is what the close flow already sends.
     * This screen's panel asks for one figure, so sending an empty breakdown
     * would claim a count nobody made.
     */
    body: JSON.stringify({ amount, reason: reason.slice(0, REASON_MAX) }),
  });
}
