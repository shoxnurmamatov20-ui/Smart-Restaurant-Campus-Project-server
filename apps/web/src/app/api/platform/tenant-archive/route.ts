import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * Ending a customer relationship — `DELETE /platform/tenants/{tenant}`.
 *
 * Its own door rather than a fourth field on `../tenant/route.ts`, because the
 * two acts are not neighbours: one pauses a restaurant for a fortnight over an
 * unpaid invoice, this one takes a business off the platform. The card already
 * makes the operator type the restaurant's name; putting the call behind its
 * own path means a mistyped body cannot arrive here by accident either.
 *
 * `DELETE` upstream and still a `POST` here, because the browser half of this
 * console is `lib/console-post.ts` and it posts — a verb is not worth a second
 * client helper that click handlers could forget to catch. The rename happens
 * in one line below, where it is visible.
 *
 * Nothing is actually removed. The tenant's status becomes `archived`, which
 * `ResolveTenant` refuses like a suspension, and every invoice, audit row and
 * order ever taken keeps pointing at a row that still exists — which is what
 * makes the ninety-day window the card promises a window on anything at all.
 */
type Body = { tenantId?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const tenantId = whole(body.tenantId);

  // A fixture row has no numeric key, and this is the last call on the product
  // that should ever run against a guess.
  if (tenantId === null) return badRequest('invalid_tenant');

  return forward(request, `/platform/tenants/${tenantId}`, { method: 'DELETE' });
}
