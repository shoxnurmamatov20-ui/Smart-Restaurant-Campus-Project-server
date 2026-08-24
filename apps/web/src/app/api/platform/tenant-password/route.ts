import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * A new password for a restaurant's owner — `POST /platform/tenants/{id}/owner-password`.
 *
 * Its own door rather than a field on `../tenant/route.ts`, for the same reason
 * the archive has one: that handler carries status, plan and note, which are
 * facts about a customer's account, and this issues a credential. A body key
 * that could arrive by accident is not the shape for the second kind.
 *
 * Nothing is sent up but the id. The password is generated upstream and never
 * chosen here — an operator who could type one would type the same one for
 * every restaurant they open — and the answer carries it exactly once, which is
 * why the card holds it on screen rather than flashing it.
 */
type Body = { tenantId?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const tenantId = whole(body.tenantId);

  // A fixture row carries no numeric key, and a guess here would reset the
  // password of whichever restaurant happens to hold that id.
  if (tenantId === null) return badRequest('invalid_tenant');

  return forward(request, `/platform/tenants/${tenantId}/owner-password`, { method: 'POST' });
}
