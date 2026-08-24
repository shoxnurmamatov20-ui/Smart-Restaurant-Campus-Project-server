import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * A booking called off — `POST /api/v1/tables/reservations/{id}/cancel`.
 *
 * The rota's diary drew a × on every row that only greyed the line out in local
 * state and flashed "booking dropped". The booking was still live on the
 * server: it came back on the next render, the guest still arrived, and the
 * table stayed held on every other screen. The endpoint existed the whole time.
 *
 * Its own route rather than a PATCH with `status: cancelled`, because that is
 * how the API models it — cancelling releases the table and stamps the row, and
 * a client writing the column directly would do half of that.
 */
type Body = { id?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const id = whole(body.id);

  // A fixture row's key is a word, not a number. Checked here so a tap on the
  // demo console never reaches the API to come back as a failure the panel
  // would have to show as a real one.
  if (id === null) return badRequest('invalid_reservation');

  return forward(request, `/tables/reservations/${id}/cancel`, { method: 'POST' });
}
