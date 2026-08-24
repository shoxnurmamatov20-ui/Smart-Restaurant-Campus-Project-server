import { NextResponse, type NextRequest } from 'next/server';

import { MP_SESSION_COOKIE } from './mp-cookie';
import { apiBase } from './server-session';

/**
 * Writing to the API as a marketplace customer, through Node.
 *
 * `api-proxy.ts` is the same thing for a member of staff and cannot serve here:
 * it reads `restaurant-campus-session`, which is a console account with a
 * tenant and a role. A marketplace customer has neither — they belong to the
 * platform rather than to any one restaurant — and their credential lives in a
 * seventh cookie for exactly that reason (`mp-cookie.ts` explains why it is
 * seventh rather than one of the six).
 *
 * What is shared is the reason for the hop at all: the token is httpOnly, so
 * the page cannot read it, so a click handler cannot call Laravel itself. It
 * calls a handler on this origin and the handler adds who is asking.
 *
 * **No `Idempotency-Key`.** The console's proxy sends one on every write and it
 * would be dead weight here: the key is stored against a tenant, in a table
 * behind row-level security, and this caller has no tenant. Where a consumer
 * write must not happen twice the guarantee lives in the data instead — see the
 * unique `(consumer_id, client_reference)` index `/api/mp/orders` relies on.
 *
 * Two failure shapes, kept apart. A missing cookie answers 401 here rather than
 * upstream, so a screen can send somebody to sign in without a round trip that
 * was always going to fail; a network failure answers 502; anything the API
 * refused goes back with its own status and its own body, because the envelope
 * carries the code the screen branches on and the sentence in three languages.
 */
export async function mpForward(
  request: NextRequest,
  path: string,
  init: RequestInit,
): Promise<NextResponse> {
  const token = request.cookies.get(MP_SESSION_COOKIE)?.value;

  if (token === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  // 204 has no body to parse, and calling .json() on one throws.
  if (upstream.status === 204) return new NextResponse(null, { status: 204 });

  let body: unknown;

  try {
    body = await upstream.json();
  } catch {
    return NextResponse.json({ error: 'unreadable_answer' }, { status: 502 });
  }

  return NextResponse.json(body, { status: upstream.status });
}
