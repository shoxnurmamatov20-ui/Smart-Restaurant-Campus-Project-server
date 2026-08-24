import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * The shop's own switch: taking orders, or not.
 *
 * `PATCH /api/v1/marketplace/settings` upstream. One field, and the narrowness
 * is the point rather than an unfinished job — it is the control a merchant
 * reaches for when the fryer dies, so it lives in the header on every view and
 * has to work in one tap.
 *
 * **`is_open` is not `status`.** The store says whether it is trading tonight;
 * the platform says whether the storefront is on the market at all. The second
 * is absent from `UpdateStoreSettingsRequest` entirely — a merchant who could
 * set it to `live` would be reviewing themselves — and so is
 * `commission_percent`, which is negotiated rather than typed.
 *
 * The rest of the settings screen is deliberately read-only and says so once at
 * its foot, so nothing else is forwarded here. When a row of it becomes
 * editable it belongs in this handler beside `is_open` — with the one warning
 * the route carries: the write asks for `marketplace.manage` rather than
 * `marketplace.update`, because changing the delivery fee, the minimum basket
 * or the promised window is a commercial decision and the person answering the
 * phone at eight should not be the one who makes it.
 */
type Body = { isOpen?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null || typeof body.isOpen !== 'boolean') return badRequest('invalid_body');

  return forward(request, '/marketplace/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_open: body.isOpen }),
  });
}
