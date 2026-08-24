import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * Opening a bill from the console — `POST /api/v1/orders/orders`.
 *
 * The design draws a "New order" button on the orders screen and it was an
 * `ActionButton`: it flashed a sentence and opened nothing. What it opens now
 * is the intake desk's version of an order, not the till's — and the difference
 * is the basket.
 *
 * **No lines.** Choosing dishes, modifiers, seats and courses is the POS
 * terminal's whole screen, and rebuilding it inside a table view would be a
 * second till that drifts from the first. What an operator taking a call needs
 * is the bill OPENED against the right conversation: which channel it came
 * through, whose telephone number it is, where it is going. The waiter or the
 * cashier adds the dishes on the terminal, against the order this created.
 *
 * A sibling of `../route.ts` rather than a case in its switch. That handler
 * acts on an order that exists — void, refund, discount, move — and this one
 * brings one into being: a different permission upstream (`orders.create`
 * against `orders.update`), and a different set of refusals.
 */
type Body = {
  channel?: unknown;
  intakeChannel?: unknown;
  tableId?: unknown;
  guests?: unknown;
  customerName?: unknown;
  customerPhone?: unknown;
  address?: unknown;
  note?: unknown;
};

/** `Order::CHANNELS` — how the food leaves the building. */
const CHANNELS: readonly string[] = ['dine_in', 'takeaway', 'delivery', 'aggregator'];

/**
 * `Order::INTAKE_CHANNELS` — which conversation it arrived through.
 *
 * A different axis from the one above, and the API keeps them apart for the
 * reason its resource states: a delivery ordered on the telephone and a
 * delivery ordered in Telegram leave the building the same way and are answered
 * by different people.
 */
const INTAKES: readonly string[] = ['phone', 'telegram', 'site', 'yandex', 'uzum', 'wolt'];

const trimmed = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const channel = trimmed(body.channel);
  const intake = trimmed(body.intakeChannel);
  const phone = trimmed(body.customerPhone);
  const address = trimmed(body.address);

  if (!CHANNELS.includes(channel)) return badRequest('invalid_channel');
  if (intake !== '' && !INTAKES.includes(intake)) return badRequest('invalid_intake');

  /*
   * A delivery with no address is not a degraded order; it is not an order.
   *
   * The API says the same and refuses it, but a form that posts anyway is a
   * form whose reader learns about the missing field from a 422 rather than
   * from the box they left empty.
   */
  if (channel === 'delivery' && address === '') return badRequest('address_required');
  if (phone !== '' && (phone.length < 7 || phone.length > 32)) return badRequest('invalid_phone');

  return forward(request, '/orders/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel,
      intake_channel: intake === '' ? null : intake,
      restaurant_table_id: whole(body.tableId),
      guests_count: whole(body.guests),
      customer_name: trimmed(body.customerName) === '' ? null : trimmed(body.customerName),
      customer_phone: phone === '' ? null : phone,
      delivery_address: address === '' ? null : address,
      note: trimmed(body.note) === '' ? null : trimmed(body.note),
      /*
       * Which software posted it, which is not which conversation it was. `pos`
       * is what the API's own docblock calls an order typed at the intake desk,
       * and this is that desk.
       */
      source: 'pos',
    }),
  });
}
