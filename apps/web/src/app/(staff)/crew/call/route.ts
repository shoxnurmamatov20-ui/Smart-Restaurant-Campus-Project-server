import { type NextRequest } from 'next/server';

import { crewBadRequest, crewBody, crewForward, crewWhole } from '../../crew-proxy';

/**
 * Closing a raised hand — `POST /api/v1/tables/calls/{call}/resolve`.
 *
 * The panel's button used to set a local flag and flash. Two waiters could both
 * "clear" the same call, the kitchen kept chasing it, and the card was back the
 * next time the phone reloaded — on the one screen whose whole subject is a
 * plate going cold on the pass.
 *
 * Two words the endpoint takes and both are promises: `acknowledged` tells the
 * guest's own screen somebody is on the way, `done` closes the call and is what
 * the waiting-time report measures against. The panel's single button means
 * "I have dealt with it", so it sends `done`; the intermediate word is left for
 * a control that actually offers it rather than being guessed at here.
 */
type Body = { callId?: unknown; status?: unknown };

/** `WaiterCall` accepts these two and nothing else. */
const STATUSES: readonly string[] = ['acknowledged', 'done'];

export async function POST(request: NextRequest) {
  const body = await crewBody<Body>(request);

  if (body === null) return crewBadRequest('invalid_body');

  const callId = crewWhole(body.callId);

  /* A fixture card has no numeric id. The panel falls back to `CALLS` whenever
     the queue could not be read, and resolving one of those would post an id
     naming nothing — or, worse, somebody else's open call. */
  if (callId === null) return crewBadRequest('not_a_live_call');

  const status =
    typeof body.status === 'string' && STATUSES.includes(body.status) ? body.status : 'done';

  return crewForward(request, `/tables/calls/${callId}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}
