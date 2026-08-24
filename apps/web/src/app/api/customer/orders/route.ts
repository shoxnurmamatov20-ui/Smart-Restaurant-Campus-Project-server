import type { NextRequest } from 'next/server';

import { forward } from '@/lib/customer-gateway';

/**
 * A guest's own order history — `GET /api/v1/public/orders`.
 *
 * Under `api/customer/` rather than `api/public/` because the token is the
 * whole of it. Everything in `api/public/` is reachable by a stranger: the
 * menu, placing an order, tracking one with its number and the last four digits
 * of the phone that placed it. A LIST is different — keyed on anything a
 * request can claim, it would hand somebody's whole ordering history to whoever
 * knows their number, which in this country is most of a receipt.
 *
 * So `signedIn: true`, which refuses locally when the cookie is missing rather
 * than spending a round trip to be told the same thing.
 */
export async function GET(request: NextRequest) {
  return forward(request, '/public/orders', { method: 'GET', signedIn: true });
}
