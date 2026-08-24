import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * The owner's next password — `POST /platform/tenants/{id}/owner-password`.
 *
 * Its own door rather than a field on `../tenant/route.ts`, for the same reason
 * the archive has one: that handler carries status, plan and note, which are
 * facts about a customer's account, and this issues a credential. A body key
 * that could arrive by accident is not the shape for the second kind.
 *
 * The password may be chosen or left to the generator. It used to be generated
 * and only generated, on the argument that an operator who can choose will reuse
 * one weak string everywhere — right about the risk, wrong about the remedy,
 * because the case it blocked is an owner ringing up and asking for a password
 * they can remember. The strength rule upstream refuses the weak repeat without
 * refusing the request; empty still generates, and the console offers that first.
 *
 * Sent only when it is a non-empty string. An empty field must reach the API as
 * an *absent* key rather than `""`, or `nullable` would take it as a deliberate
 * blank and the generator would never run.
 *
 * The answer carries the password exactly once, which is why the card holds it
 * on screen until it is dismissed rather than flashing it in a toast.
 */
type Body = { tenantId?: unknown; password?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const tenantId = whole(body.tenantId);

  // A fixture row carries no numeric key, and a guess here would reset the
  // password of whichever restaurant happens to hold that id.
  if (tenantId === null) return badRequest('invalid_tenant');

  const chosen = typeof body.password === 'string' ? body.password.trim() : '';

  return forward(request, `/platform/tenants/${tenantId}/owner-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(chosen === '' ? {} : { password: chosen }),
  });
}
