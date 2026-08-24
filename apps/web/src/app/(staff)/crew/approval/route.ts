import { type NextRequest } from 'next/server';

import { crewBadRequest, crewBody, crewForward, crewWhole } from '../../crew-proxy';

/**
 * A manager answering — `POST /api/v1/pos/approvals/{approval}/decide`.
 *
 * The reason this app exists at all. A waiter cannot give a fifteen percent
 * discount, void a fired dish or refund a card without somebody senior saying
 * yes, and the manager is in the office, at the other branch, or at home. Every
 * minute the queue sits unanswered is a table waiting with a bill in front of
 * them — so the answer has to leave the phone, and until now it did not.
 *
 * **Not part of the offline queue, deliberately.** `POST /staff/actions` holds
 * eight verbs and none of them is this one, which is right: a decision queued
 * on a phone with no signal is a waiter standing at a table believing an answer
 * is coming. Approving is one of the few things in this app that is worth
 * failing loudly rather than deferring quietly.
 *
 * **`pos.approve`, which a waiter does not hold.** The permission is checked
 * upstream and so is the rule that actually matters: `ApprovalController::decide`
 * refuses an approval decided by the person who asked for it. Without that line
 * the whole table is decoration, and it is not repeated here — one authority,
 * not two that can drift.
 */
type Body = { approvalId?: unknown; approved?: unknown };

export async function POST(request: NextRequest) {
  const body = await crewBody<Body>(request);

  if (body === null) return crewBadRequest('invalid_body');

  const approvalId = crewWhole(body.approvalId);

  /*
   * A fixture row has no numeric id.
   *
   * The panel falls back to `APPROVALS` whenever the queue could not be read,
   * and answering one of those would post an id that names nothing. Refused
   * here so the screen can say the queue is a sample rather than reporting a
   * server error about a request it should never have made.
   */
  if (approvalId === null) return crewBadRequest('not_a_live_approval');

  if (typeof body.approved !== 'boolean') return crewBadRequest('no_verdict');

  return crewForward(request, `/pos/approvals/${approvalId}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved: body.approved }),
  });
}
