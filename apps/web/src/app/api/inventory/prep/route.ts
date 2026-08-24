import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * The kitchen made a batch of something.
 *
 * Production, not creation: the body names a prep card and a number of batches,
 * and what the API writes is a consumption on every component plus a rise in
 * `on_hand`. Whole batches, because a card that yields 880 usable grams cannot
 * be asked for 500 without scaling every component to a fraction of a gram.
 */
type Body = { prepItemId?: unknown; batches?: unknown; reference?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const prepItemId = whole(body.prepItemId);
  const batches = whole(body.batches);

  if (prepItemId === null || batches === null) return badRequest('invalid_body');

  return forward(request, '/inventory/prep', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prep_item_id: prepItemId,
      batches,
      reference:
        typeof body.reference === 'string' && body.reference !== '' ? body.reference : null,
    }),
  });
}
