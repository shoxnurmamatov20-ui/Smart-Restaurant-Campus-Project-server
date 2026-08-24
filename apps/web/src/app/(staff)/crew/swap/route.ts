import { type NextRequest } from 'next/server';

import { crewBadRequest, crewBody, crewForward, crewWhole } from '../../crew-proxy';

/**
 * "I cannot work this one" — `POST /api/v1/staff/shift-swaps`.
 *
 * The swap sheet drew a weekday heading and three first names and posted
 * nothing, and the heading was the reason it could not: "Payshanba" names a
 * different Thursday every week, so the form had no way of saying which shift
 * it meant even to a human. `GET /staff/me/upcoming` answers with shift ids and
 * colleagues' staff-member ids, and this is where the choice goes.
 *
 * **`offered_to_id` is optional and left out is the common case.** Somebody
 * with a wedding to go to posts the shift to whoever will take it; naming a
 * colleague is the narrower ask. The upstream request says the same, and a
 * manager assigns it when they approve.
 *
 * **`staff.update`, which a waiter holds.** Raising a swap and granting one are
 * two different powers on purpose — asking to be let off Thursday is not
 * deciding who covers it — and the verdict half needs `staff.manage`, which is
 * why the approve queue lives on the manager's tab and not here.
 *
 * Not queued. A swap request is a conversation with a manager, and one raised
 * twice by a drained queue is two rows in somebody's approvals with no way to
 * tell which was meant — the server already refuses a second pending request
 * per shift, and answering that refusal on screen is more use than hiding it.
 */

type Incoming = { shiftId?: unknown; offeredToId?: unknown; reason?: unknown };

export async function POST(request: NextRequest) {
  const body = await crewBody<Incoming>(request);

  if (body === null) return crewBadRequest('invalid_body');

  const shiftId = crewWhole(Number(body.shiftId));

  if (shiftId === null) return crewBadRequest('shift_required');

  // Null rather than absent when nobody was picked: the upstream rule is
  // `nullable`, and sending `0` would fail an `exists` check that reads as
  // "that colleague does not work here".
  const offeredToId = crewWhole(Number(body.offeredToId));

  return crewForward(request, '/staff/shift-swaps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shift_id: shiftId,
      offered_to_id: offeredToId,
      reason: typeof body.reason === 'string' ? body.reason.slice(0, 255) : undefined,
    }),
  });
}
