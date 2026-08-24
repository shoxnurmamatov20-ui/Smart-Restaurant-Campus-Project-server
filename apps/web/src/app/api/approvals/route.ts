import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * A manager answering a request from a till.
 *
 * The other half of `api/pos/approval/route.ts`, and deliberately a second
 * route rather than a branch inside that one. Raising a request goes up on the
 * **terminal's** credential — the person asking is a waiter with a guest in
 * front of them — and answering one goes up on the **manager's own session
 * token**, which is the only thing that makes `ApprovalController::decide`
 * mean anything: it refuses an approval decided by the person who asked for it,
 * and it writes their name into the fraud ledger either way. One route carrying
 * both credentials would be one route where the wrong one could be picked.
 *
 * `decide` also derives *where* the answer came from rather than believing the
 * body — a token with an open `TerminalSession` behind it is somebody standing
 * at a till, anything else is remote. That is why nothing here sends a method
 * or a device: the one field an investigation leans on must not be supplied by
 * the party being investigated.
 *
 * **The keypad on this screen is not a credential.** The console has no PIN
 * door — `POST /api/v1/auth/pin` mints a till session, not a console one — so
 * the four digits the modal collects are a confirmation step and are not sent.
 * The API decides on the bearer token, which is the manager who signed into the
 * console; a PIN posted alongside it would be a second secret nothing checks.
 */
type Body = { approvalId?: unknown; approved?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const approvalId = whole(body.approvalId);

  /*
   * Checked here as well as upstream, because both queues that render this
   * component still carry fixture rows (`ap-1`, `ap-2`). Without this a tap on
   * the demo dashboard would reach the API and come back as a 404 the screen
   * would have to show as a real refusal.
   */
  if (approvalId === null) return badRequest('invalid_approval');
  if (typeof body.approved !== 'boolean') return badRequest('invalid_verdict');

  return forward(request, `/pos/approvals/${approvalId}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved: body.approved }),
  });
}
