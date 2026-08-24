import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * A zone: opened, or its seat count corrected.
 *
 * Both halves of the settings screen's zone panel, in one handler because the
 * browser only ever POSTs — the session token is an httpOnly cookie, so every
 * write is a call to this origin and the upstream verb is chosen here. A body
 * carrying an `id` is an edit (`PATCH /api/v1/tables/halls/{hall}`); one
 * without is a new zone (`POST /api/v1/tables/halls`).
 *
 * ---------------------------------------------------------------------------
 * What the stepper can and cannot move
 *
 * The design's stepper shows a table count and moves the seat count with it.
 * Only the second half is writable, and the reason is structural rather than
 * missing: a hall's `tables_count` is a count of rows in `tables.tables`, so
 * "make it nineteen" is a floor-plan edit — a table has a number, a shape and a
 * position — and it belongs to the floor editor, not to a ± pair on a settings
 * page. `capacity` is a column on the hall and is exactly what the stepper's
 * seat figure means, so that is what travels.
 */
type Body = {
  /** Absent for a new zone; the hall's own id for an edit. */
  id?: unknown;
  name?: unknown;
  /** Seats, which is the hall's `capacity`. */
  seats?: unknown;
};

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const seats = typeof body.seats === 'number' ? Math.round(body.seats) : null;

  if (seats !== null && (seats < 0 || seats > 5000)) return badRequest('invalid_seats');

  const id = body.id === undefined || body.id === null ? null : whole(body.id);

  if (id !== null) {
    return forward(request, `/tables/halls/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(seats === null ? {} : { capacity: seats }),
    });
  }

  // An edit whose id did not survive the check is a fixture row, not a hall.
  // Falling through to "create" would open a second zone with the same name.
  if (body.id !== undefined && body.id !== null) return badRequest('invalid_hall');

  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (name.length < 2 || name.length > 120) return badRequest('invalid_name');

  const code = codeFrom(name);

  if (code === '') return badRequest('invalid_name');

  return forward(request, '/tables/halls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      name,
      capacity: seats ?? 0,
      is_active: true,
    }),
  });
}

/**
 * A code from the name, to `StoreHallRequest`'s own pattern.
 *
 * Uppercase because a hall code is read aloud on a headset — "table nine, VIP"
 * — and because the seeded ones already are. A duplicate comes back as the
 * API's own 422 rather than being suffixed into a second `ZAL-2` nobody meant
 * to open.
 */
function codeFrom(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}
