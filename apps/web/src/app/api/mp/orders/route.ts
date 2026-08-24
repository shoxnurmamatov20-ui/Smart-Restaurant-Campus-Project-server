import { NextResponse, type NextRequest } from 'next/server';

import { MP_SESSION_COOKIE } from '@/lib/mp-cookie';
import { apiBase } from '@/lib/server-session';

/**
 * Placing a marketplace order.
 *
 * A proxy rather than a direct call, because the credential is in an httpOnly
 * cookie the checkout page cannot read — which is the point of putting it
 * there. The page sends what it knows (a shop, a basket, an address); this adds
 * who is asking.
 *
 * ---------------------------------------------------------------------------
 * What is NOT forwarded, and why the list is short
 *
 * Only the fields below. Not a price, not a subtotal, not a total, not a
 * delivery fee, not a `plus` flag — the API reads every one of those from the
 * catalogue, the storefront and the account, and a proxy that passed them
 * through would be a proxy that could be talked into a free dinner. Dropping
 * them here is belt as well as braces: the server ignores them, and they never
 * arrive.
 *
 * ---------------------------------------------------------------------------
 * `client_reference` is the thing that stops two dinners
 *
 * A marketplace customer has no tenant, so `Idempotency-Key` cannot work for
 * them — the key is stored against a tenant and the table is behind row-level
 * security. The guarantee lives in the data instead: the API holds a unique
 * index on `(consumer_id, client_reference)`, so a retried checkout returns the
 * FIRST order rather than cooking a second meal.
 *
 * The reference is the basket's, minted in the browser when the basket is
 * started, so it survives this handler being called twice by a double tap AND
 * the page being reloaded mid-request. One generated here would not: a fresh
 * uuid per attempt is exactly the case the index is meant to catch.
 */

type Line = { menu_item_id: number; quantity: number; note?: string };

/** Forty lines is a party order; longer than that is a script. */
const MAX_LINES = 40;

export async function POST(request: NextRequest) {
  const token = request.cookies.get(MP_SESSION_COOKIE)?.value;

  if (token === undefined) {
    // No session. Refused here rather than upstream so the checkout can send
    // the guest to sign in without a round trip that was always going to 401.
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const store = typeof body.store === 'string' ? body.store : null;
  const address = typeof body.address === 'string' ? body.address : null;
  const lines = Array.isArray(body.lines) ? body.lines.slice(0, MAX_LINES) : [];

  if (store === null || address === null || lines.length === 0) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 422 });
  }

  const basket: Line[] = [];

  for (const raw of lines) {
    const line = raw as Record<string, unknown>;
    const id = Number(line.menu_item_id);
    const quantity = Number(line.quantity);

    // Quietly dropping a malformed line would take a dish off somebody's order
    // without telling them, so the whole basket is refused instead.
    if (!Number.isInteger(id) || id < 1 || !Number.isInteger(quantity) || quantity < 1) {
      return NextResponse.json({ error: 'invalid_line' }, { status: 422 });
    }

    basket.push({
      menu_item_id: id,
      quantity,
      ...(typeof line.note === 'string' ? { note: line.note.slice(0, 255) } : {}),
    });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/mp/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        store,
        lines: basket,
        address: address.slice(0, 255),
        ...(typeof body.address_note === 'string'
          ? { address_note: body.address_note.slice(0, 255) }
          : {}),
        ...(typeof body.pay_rail === 'string' ? { pay_rail: body.pay_rail } : {}),
        ...(typeof body.promo_code === 'string' ? { promo_code: body.promo_code } : {}),
        ...(typeof body.client_reference === 'string'
          ? { client_reference: body.client_reference }
          : {}),
      }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  const payload = (await upstream.json().catch(() => null)) as unknown;

  // The error envelope goes back untouched: it carries the code the screen
  // branches on and the sentence in all three languages, and re-wording it here
  // would be a fourth translation of somebody else's refusal.
  return NextResponse.json(payload ?? { error: 'invalid_response' }, { status: upstream.status });
}
