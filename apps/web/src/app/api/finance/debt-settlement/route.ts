import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * A guest paying off what they owe.
 *
 * Upstream is CRM — `POST /crm/customers/{id}/account/settlement`, permission
 * `crm.update` — but the screen that calls it is Finance › Books, and a route
 * handler belongs beside the screen that uses it rather than beside the module
 * that answers it. The guest account is the one place the balance lives; the
 * books screen only reads it.
 *
 * The amount is the whole outstanding balance, because the design's button is
 * "receive" and not a payment form. The ceiling is not enforced here and must
 * not be: `EloquentGuestAccounts::settle()` checks it under a lock, and a
 * client comparing against a balance it fetched a minute ago would let two
 * people settle the same debt twice.
 *
 * No money moves in Finance from this. Settling a debt is a receipt against a
 * sale that was booked the day the ticket closed — recording it as revenue
 * again is how a month gets counted twice, and the screen says so under the
 * table.
 */
type Body = {
  customerId?: unknown;
  /** Integer tiyin. */
  amountTiyin?: unknown;
  note?: unknown;
};

/** Upstream's `max:255`. */
const NOTE_MAX = 255;

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const customerId = whole(body.customerId);

  if (customerId === null) return badRequest('invalid_customer');

  const amount = whole(body.amountTiyin);

  if (amount === null) return badRequest('invalid_amount');

  const note = typeof body.note === 'string' ? body.note.trim() : '';

  return forward(request, `/crm/customers/${customerId}/account/settlement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount,
      note: note === '' ? null : note.slice(0, NOTE_MAX),
    }),
  });
}
