import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * The owner's own details — `PATCH /platform/tenants/{id}/owner`.
 *
 * The address a restaurant signs in with is typed from what an operator heard on
 * a phone call, and one wrong character in it is a business that cannot get in
 * at all: `/forgot-password` needs a mailer and this deployment runs
 * `MAIL_MAILER=log`, so the only repair used to be onboarding the restaurant a
 * second time.
 *
 * Deliberately not the same door as the password. That one ends every session
 * the account has open; this one is an idempotent correction, and an operator
 * fixing a phone number must not sign the owner out of the till they are
 * standing at.
 *
 * Only the keys the form actually sent are forwarded. `PATCH` upstream is
 * `sometimes`-validated, so an absent key means "leave it alone" — whereas
 * sending `{ phone: '' }` for a field the operator never touched would clear a
 * number nobody asked to clear. The one exception is a phone the operator
 * emptied on purpose, which is why `''` is forwarded as `null` rather than
 * dropped: the two are different intentions and the API distinguishes them.
 */
type Body = { tenantId?: unknown; name?: unknown; email?: unknown; phone?: unknown };

/*
 * POST from the browser, PATCH upstream — the same shape `../tenant/route.ts`
 * uses. The console's `post()` helper speaks one verb, and a second one here
 * would be a second way to call the API from the same screen.
 */
export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const tenantId = whole(body.tenantId);

  // A fixture row carries no numeric key, and a guess would edit the owner of
  // whichever restaurant happens to hold that id.
  if (tenantId === null) return badRequest('invalid_tenant');

  const patch: Record<string, string | null> = {};

  if (typeof body.name === 'string' && body.name.trim() !== '') patch.name = body.name.trim();
  if (typeof body.email === 'string' && body.email.trim() !== '') patch.email = body.email.trim();
  if (typeof body.phone === 'string')
    patch.phone = body.phone.trim() === '' ? null : body.phone.trim();

  // Nothing to do is a client mistake rather than a round trip: the API would
  // answer 200 having changed nothing, and the console would report success for
  // a form the operator had not filled in.
  if (Object.keys(patch).length === 0) return badRequest('nothing_to_change');

  return forward(request, `/platform/tenants/${tenantId}/owner`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}
