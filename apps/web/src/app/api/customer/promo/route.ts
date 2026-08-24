import { type NextRequest } from 'next/server';

import { forward } from '@/lib/customer-gateway';

/**
 * Is this word worth anything on this basket?
 *
 * The server decides — `PROMO_CODES` in the surfaces package says why in its
 * own docblock: "a client that decides its own discount decides its own price".
 * The token rides along when there is one, because a per-customer limit needs a
 * customer to count against and a reserved loyalty coupon is personal.
 */
export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  return forward(request, '/public/promo-codes/check', {
    method: 'POST',
    body,
    signedIn: 'optional',
  });
}
