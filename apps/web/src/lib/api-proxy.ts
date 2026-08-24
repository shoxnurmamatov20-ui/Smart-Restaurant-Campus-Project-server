import { NextResponse, type NextRequest } from 'next/server';

import { BRANCH_COOKIE, isBranchRefusal } from './branch-cookie';
import { apiBase, SESSION_COOKIE } from './server-session';

/**
 * Writing to the API from a browser, through Node.
 *
 * `api-server.ts` is the read half and is for server components. This is the
 * write half, and it exists for a reason the read half does not have: a console
 * screen that changes something is a client component reacting to a click, and
 * a client component cannot read the session token — it is in an httpOnly
 * cookie, deliberately, because a token JavaScript can read is a token an
 * injected script can post somewhere.
 *
 * So the browser calls a route handler on the same origin, and the handler
 * forwards the person's own token upstream. The API then decides on their
 * permissions rather than on the console's, and the audit row names them.
 *
 * A key per call. The API requires `Idempotency-Key` on every write, and the
 * one it is protecting against here is not a double tap — that is the client's
 * problem and the API answers it identically twice — it is a response lost on
 * the way back, where the browser retries something that already happened.
 *
 * Two failure shapes, kept apart on purpose. A network failure is ours and
 * answers 502; anything the API refused is passed through with its own status
 * and its own body, because the error envelope carries a code and three
 * languages and the screen has to be able to show them.
 */
export type ForwardFailure = { error: string };

export async function forward(
  request: NextRequest,
  path: string,
  init: RequestInit,
): Promise<NextResponse> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token === undefined) {
    return NextResponse.json<ForwardFailure>({ error: 'not_signed_in' }, { status: 401 });
  }

  /*
   * Which venue this write is about — the same cookie every read carries.
   *
   * It matters more here than on a read. Shutting an intake door, setting a
   * prep time or opening a till is a change to ONE venue, and a write that
   * arrived unscoped while the reader was looking at Yunusobod would apply to
   * the whole business: the screen would show the change on the venue it was
   * made from and the other four would quietly follow.
   */
  const branch = request.cookies.get(BRANCH_COOKIE)?.value;

  /*
   * One key for the attempt AND for its retry, deliberately.
   *
   * The key protects against a response lost on the way back — the browser
   * retrying something that already happened. The retry below is a request
   * that was refused BEFORE the controller ran, so nothing happened and
   * re-using the key is correct; minting a second one would turn a refusal
   * into a second chance to double a write.
   */
  const key = crypto.randomUUID();

  let attempt: Attempt;

  try {
    attempt = await send(path, init, token, key, branch);
  } catch {
    return NextResponse.json<ForwardFailure>({ error: 'api_unreachable' }, { status: 502 });
  }

  /*
   * A venue this reader may no longer write to.
   *
   * Same two codes the read path retries on, and the same reasoning: a cookie
   * outlives the venue it names. Narrowed to those codes rather than to a 403,
   * because retrying a PERMISSION refusal without the header would not be a
   * retry — it would be the same change applied to the whole business instead
   * of to one venue, which is the exact failure the header exists to prevent.
   */
  if (branch !== undefined && isBranchRefusal(attempt.body)) {
    try {
      attempt = await send(path, init, token, key, undefined);
    } catch {
      return NextResponse.json<ForwardFailure>({ error: 'api_unreachable' }, { status: 502 });
    }
  }

  if (attempt.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  if (attempt.unreadable) {
    return NextResponse.json<ForwardFailure>({ error: 'unreadable_answer' }, { status: 502 });
  }

  return NextResponse.json(attempt.body, { status: attempt.status });
}

/** One upstream attempt, already read. */
type Attempt = { status: number; body: unknown; unreadable: boolean };

async function send(
  path: string,
  init: RequestInit,
  token: string,
  key: string,
  branch: string | undefined,
): Promise<Attempt> {
  const upstream = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': key,
      ...(branch === undefined || branch === '' ? {} : { 'X-Branch': branch }),
    },
    cache: 'no-store',
  });

  // 204 has no body to parse, and calling .json() on one throws.
  if (upstream.status === 204) {
    return { status: 204, body: null, unreadable: false };
  }

  try {
    return { status: upstream.status, body: await upstream.json(), unreadable: false };
  } catch {
    return { status: upstream.status, body: null, unreadable: true };
  }
}

/**
 * Reading the API from a route handler.
 *
 * `apiGet()` is the read every screen uses and it cannot serve this: it calls
 * `next/headers`, which is a server COMPONENT api, and a route handler holds
 * the request instead. The two reads a handler genuinely needs are both about
 * checking something before it writes — is this venue one of ours, is this
 * reader pinned to another — and both must not be done in the browser, where
 * the answer could simply be skipped.
 *
 * `null` for anything other than a clean answer, exactly like `apiGet`. A
 * handler that cannot verify must refuse rather than assume.
 */
export async function forwardRead<T>(request: NextRequest, path: string): Promise<T | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token === undefined) return null;

  try {
    const upstream = await fetch(`${apiBase()}${path}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (!upstream.ok) return null;

    return (await upstream.json()) as T;
  } catch {
    return null;
  }
}

/** Read a JSON body, or answer 400 rather than throwing at the framework. */
export async function jsonBody<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export const badRequest = (reason: string): NextResponse =>
  NextResponse.json<ForwardFailure>({ error: reason }, { status: 400 });

/** A positive whole number, or null — what every id and quantity here has to be. */
export function whole(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}
