import { NextResponse, type NextRequest } from 'next/server';

import { apiBase } from '@/lib/server-session';

import { CREW_SESSION_COOKIE, CREW_TENANT_COOKIE } from './crew-session';

/**
 * Writing to the API from the staff app, through Node.
 *
 * `crew-server.ts` is the read half and is for server components. This is the
 * write half, and it exists for the reason the read half does not have: a
 * screen that changes something is a client component reacting to a press, and
 * a client component cannot read the shift session — it is in an httpOnly
 * cookie, deliberately, because a staff phone is passed between two people on a
 * shift and left on a pass, and a token JavaScript can read is a token that
 * leaves in the first piece of injected script.
 *
 * ---------------------------------------------------------------------------
 * Its own forwarder, and not `@/lib/api-proxy`
 *
 * That module reads the console's session cookie. This app has a different one,
 * written by a different door — a device token and a PIN rather than a password
 * — and it also has to send `X-Tenant`, because the pairing response is the only
 * place this handset learned which restaurant it belongs to. Two cookies, two
 * forwarders; the alternative was one taking a cookie name, which is a parameter
 * that exists to be passed wrongly once.
 *
 * ---------------------------------------------------------------------------
 * Two failure shapes, kept apart
 *
 * A network failure is ours and answers 502; anything the API refused is passed
 * through with its own status and its own body, because the error envelope
 * carries a code and three languages and the screen has to be able to show
 * them. `401` is a third thing and the screens act on it: the shift session went
 * and the person needs the keypad, not a retry.
 */
export type CrewFailure = { error: string };

export async function crewForward(
  request: NextRequest,
  path: string,
  init: RequestInit = {},
): Promise<NextResponse> {
  const upstream = await crewCall(request, path, init);

  if (upstream === null) {
    return NextResponse.json<CrewFailure>({ error: 'api_unreachable' }, { status: 502 });
  }

  if (upstream === 'not_signed_in') {
    return NextResponse.json<CrewFailure>({ error: 'not_signed_in' }, { status: 401 });
  }

  if (upstream.status === 204) return new NextResponse(null, { status: 204 });

  const body = (await upstream.json().catch(() => null)) as unknown;

  if (body === null) {
    return NextResponse.json<CrewFailure>({ error: 'unreadable_answer' }, { status: 502 });
  }

  return NextResponse.json(body, { status: upstream.status });
}

/**
 * The same call, with the raw response handed back.
 *
 * For a handler that has to do more than pass one answer along — opening an
 * order and then putting lines on it is two calls whose first answer nobody
 * outside this server ever sees.
 */
export async function crewCall(
  request: NextRequest,
  path: string,
  init: RequestInit = {},
): Promise<Response | null | 'not_signed_in'> {
  const token = request.cookies.get(CREW_SESSION_COOKIE)?.value;
  const tenant = request.cookies.get(CREW_TENANT_COOKIE)?.value;

  // Both or neither. A device token carries no user, so `ResolveTenant` has
  // nothing to infer the restaurant from and the request is a certain refusal.
  if (token === undefined || tenant === undefined) return 'not_signed_in';

  try {
    return await fetch(`${apiBase()}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Tenant': tenant,
        /*
         * A key per call. The API refuses every mutating request without one,
         * and what it protects against here is not a double press — that is the
         * client's problem and the API answers it identically twice — it is a
         * response lost on the way back, where the browser retries something
         * that already happened.
         */
        'Idempotency-Key': crypto.randomUUID(),
      },
      cache: 'no-store',
    });
  } catch {
    return null;
  }
}

/** Read a JSON body, or answer 400 rather than throwing at the framework. */
export async function crewBody<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export const crewBadRequest = (reason: string): NextResponse =>
  NextResponse.json<CrewFailure>({ error: reason }, { status: 400 });

/** A positive whole number, or null — what every id and quantity here has to be. */
export function crewWhole(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}
