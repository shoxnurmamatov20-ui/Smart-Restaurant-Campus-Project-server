import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * A booking taken over the phone, from the rota screen's diary.
 *
 * `POST /api/v1/tables/reservations`, on the caller's own token — the API
 * checks `tables.create` against the person who took the call, and the row it
 * writes is scoped to the venue by `X-Branch` the same way every other write
 * here is.
 *
 * ---------------------------------------------------------------------------
 * Two fields the form gives in a shape the endpoint does not take
 *
 * **The time.** The diary asks for `19:00` and the endpoint wants a full
 * timestamp it can validate as `after:now` — a booking in the past is a table
 * held for somebody who has already been and gone. The date is settled in the
 * browser rather than here: the person typing is standing in the restaurant, so
 * their clock is the room's clock, and a Node process rendering for four
 * timezones would pick the wrong day for two of them. A time that has already
 * passed today is read as tomorrow, because "19:00" said at eight in the
 * evening is never tonight.
 *
 * **The table.** The rota's diary takes a label — `12`, `VIP-3` — and
 * `restaurant_table_id` is a numeric id. Labels are not unique across halls, so
 * guessing would file the booking against the wrong room's table 12, and that
 * form offers no picker to guess from. The wish travels in `note` instead,
 * which is where a host reads it, and the booking stays unassigned — which is
 * also what `pending` means: no table is held until somebody confirms it.
 *
 * The floor plan is the exception and sends `tableId`, because there the tile
 * IS the table and carries its own row id — there is nothing to guess. Optional
 * for exactly that reason: two callers, one of which knows and one of which
 * cannot.
 */
type Body = {
  guestName?: unknown;
  guestPhone?: unknown;
  guests?: unknown;
  startsAt?: unknown;
  tableId?: unknown;
  note?: unknown;
};

const text = (value: unknown, limit: number): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, limit) : null;

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const guestName = text(body.guestName, 120);
  const guestPhone = text(body.guestPhone, 32);
  const startsAt = text(body.startsAt, 40);

  if (guestName === null) return badRequest('guest_name_required');
  if (guestPhone === null) return badRequest('guest_phone_required');
  if (startsAt === null || Number.isNaN(Date.parse(startsAt))) return badRequest('invalid_time');

  return forward(request, '/tables/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      guest_name: guestName,
      guest_phone: guestPhone,
      // Two covers, which is what the diary assumes when the field is left
      // blank — a booking for nobody is not a thing anyone means to make.
      guests_count: whole(body.guests) ?? 2,
      starts_at: startsAt,
      // Null rather than absent when nobody named a table: the rule is
      // `nullable`, and an unassigned booking is what `pending` already means.
      restaurant_table_id: whole(body.tableId),
      /*
       * `pending`, always, and never taken from the client.
       *
       * A booking made on the phone has not been confirmed with anybody yet:
       * confirming is `POST reservations/{id}/confirm`, a separate act with its
       * own permission, and a console that could write `confirmed` directly
       * would be a console that can hold a table without anyone agreeing to it.
       */
      status: 'pending',
      source: 'phone',
      note: text(body.note, 2000),
    }),
  });
}
