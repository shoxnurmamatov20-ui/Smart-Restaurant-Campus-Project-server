import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * A restaurant's whole archive, asked for and then collected.
 *
 * `POST /platform/tenants/{tenant}/export` starts one and answers **202**: the
 * work has been accepted, not done. That status is the whole design of this
 * route. A GDPR-shaped archive is every table a tenant owns walked in the
 * background and written to object storage, and a synchronous endpoint would
 * time out on the first customer with a year of orders behind it.
 *
 * `GET /platform/tenants/{tenant}/exports` is the collection half, and the
 * reason the card cannot simply toast and forget: the download only exists once
 * `state` is `ready`, and the `url` it carries is signed for twenty-four hours.
 * A link that did not expire would be that restaurant's entire history left on
 * a URL anyone could keep.
 *
 * A `GET` here as well as a `POST`, which is unusual for this console — the
 * browser half is `console-post.ts` and it posts. The list is the exception
 * because it is a *read* the card repeats while it waits, and turning a poll
 * into a POST would put "start an export" and "has it finished" behind the same
 * verb, one keystroke apart, on the strongest credential the platform issues.
 */
type Body = { tenantId?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const tenantId = whole(body.tenantId);

  /*
   * Checked here as well as upstream. This console draws fixtures whenever the
   * API is unreachable and those rows carry no numeric key — an export aimed at
   * a guess would hand one customer's archive to somebody looking at another's
   * card.
   */
  if (tenantId === null) return badRequest('invalid_tenant');

  return forward(request, `/platform/tenants/${tenantId}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}

export async function GET(request: NextRequest) {
  const tenantId = whole(Number(request.nextUrl.searchParams.get('tenantId')));

  if (tenantId === null) return badRequest('invalid_tenant');

  return forward(request, `/platform/tenants/${tenantId}/exports`, { method: 'GET' });
}
