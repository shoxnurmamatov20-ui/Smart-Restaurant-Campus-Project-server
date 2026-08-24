import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * A second copy of a fiscal receipt.
 *
 * `POST /finance/fiscal/receipts/{id}/duplicate` takes no body at all: the copy
 * is the whole request. It stamps `NUSXA`, increments `duplicates_printed` and
 * returns the receipt with `meta.copy_no` — nothing is filed again, which is
 * the point. A duplicate that registered itself would be one sale declared
 * twice.
 *
 * The browser posts because that is the only verb a console write uses; the
 * upstream verb is chosen here. It also means the id arrives in a body rather
 * than in this route's own path, so a fixture row cannot become a URL that
 * looks real.
 */
type Body = { receiptId?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const receiptId = whole(body.receiptId);

  if (receiptId === null) return badRequest('invalid_receipt');

  return forward(request, `/finance/fiscal/receipts/${receiptId}/duplicate`, { method: 'POST' });
}
