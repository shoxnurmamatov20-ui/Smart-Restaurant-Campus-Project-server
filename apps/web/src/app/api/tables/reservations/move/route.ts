import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * A booking moved — `PATCH /api/v1/tables/reservations/{id}`.
 *
 * The clock control on each diary row stored the new time in local state and
 * flashed it. Nothing was written, so the kitchen, the floor plan and the host
 * standing at the door all still had the old time — and the row itself came
 * back to the old time on the next render.
 *
 * The time arrives as a full timestamp, decided in the browser for the reason
 * the add form gives: the person typing is standing in the restaurant, so their
 * clock is the room's clock, and a Node process rendering for four timezones
 * would pick the wrong day for two of them.
 *
 * A table is optional and is a row id, never a label. Labels are not unique
 * across halls, so a "12" moved without a picker would file the booking against
 * another room's table twelve.
 */
type Body = { id?: unknown; startsAt?: unknown; tableId?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const id = whole(body.id);

  if (id === null) return badRequest('invalid_reservation');

  const startsAt = typeof body.startsAt === 'string' ? body.startsAt.trim() : '';

  if (startsAt === '' || Number.isNaN(Date.parse(startsAt))) return badRequest('invalid_time');

  const tableId = whole(body.tableId);

  return forward(request, `/tables/reservations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      starts_at: startsAt,
      // Only when one was named. Sending null would UNSEAT a booking that
      // already had a table, which is not what "move it to 20:30" means.
      ...(tableId === null ? {} : { restaurant_table_id: tableId }),
    }),
  });
}
