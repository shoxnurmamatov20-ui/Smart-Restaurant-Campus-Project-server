import { NextResponse, type NextRequest } from 'next/server';

import { apiBase } from '@/lib/server-session';
import {
  pairedTerminalFrom,
  POS_SHIFT_COOKIE,
  POS_SHIFT_MAX_AGE,
  POS_TILL_SKIPPED_COOKIE,
  posCookieOptions,
} from '@/lib/pos-session';

/**
 * Somebody takes the till.
 *
 * Two credentials meet here and only one of them is in the request. The device
 * token comes off the httpOnly cookie and says which till this is; the PIN
 * arrives from the keypad and says who is standing at it. The API exchanges
 * the pair for a short-lived session token, which goes straight back into a
 * cookie of its own — a shift's credential, not the device's and not a console
 * session.
 *
 * The PIN itself is forwarded once and never stored, logged or echoed. Four
 * digits typed on a screen a room can see is a weak secret by design, and the
 * lockout is what does the work the length cannot — so this handler must not
 * become a second place where attempts can be made without one.
 */
type PinResponse = {
  token: string;
  session: { user?: { id: number; name: string; roles: string[] } };
};

type ApiErrorBody = {
  error?: { code?: string; message_uz?: string; errors?: Record<string, string[]> };
};

export async function POST(request: NextRequest) {
  const terminal = pairedTerminalFrom(request);

  if (terminal === null) {
    return NextResponse.json({ error: 'not_paired' }, { status: 409 });
  }

  let body: { user_id?: unknown; pin?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const userId = typeof body.user_id === 'number' ? body.user_id : Number(body.user_id);
  const pin = typeof body.pin === 'string' ? body.pin : '';

  if (!Number.isInteger(userId) || userId < 1 || pin === '') {
    return NextResponse.json({ error: 'missing_credentials' }, { status: 422 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/pos/auth/pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${terminal.token}`,
        'X-Tenant': terminal.tenantSlug,

        /*
         * Every write to this API needs one, and signing in is a write: it
         * opens a session. Without it the API answered
         * `request.idempotency_key_missing` and nobody could sign in at all —
         * found by running the whole flow against the live server rather than
         * by reading, because the pairing call sits outside the tenant
         * middleware group and needs no key, so the two look alike and are not.
         *
         * Minted per request, which is what makes it useful: a network-level
         * retry of this same fetch carries the same key and cannot open two
         * sessions for one tap, while a genuine second attempt after a wrong
         * PIN gets its own.
         */
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({ user_id: userId, pin }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  if (!upstream.ok) {
    const detail = (await upstream.json().catch(() => null)) as ApiErrorBody | null;

    // The API's own words: it already tells a wrong PIN apart from a locked
    // one and from a person who is not on shift, and those are three different
    // things to do next.
    return NextResponse.json(
      {
        error: 'rejected',
        code: detail?.error?.code,
        message: detail?.error?.errors?.pin?.[0] ?? detail?.error?.message_uz,
      },
      { status: upstream.status },
    );
  }

  const data = (await upstream.json()) as PinResponse;
  const response = NextResponse.json({ user: data.session?.user ?? null });

  response.cookies.set(POS_SHIFT_COOKIE, data.token, {
    ...posCookieOptions,
    httpOnly: true,
    maxAge: POS_SHIFT_MAX_AGE,
  });

  return response;
}

/** Hand the till back — the person leaves, the tablet stays paired. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });

  response.cookies.set(POS_SHIFT_COOKIE, '', {
    ...posCookieOptions,
    httpOnly: true,
    maxAge: 0,
  });

  // And the "I will count it later" note, so the next person is asked rather
  // than inheriting somebody else's decision about a drawer they now hold.
  response.cookies.set(POS_TILL_SKIPPED_COOKIE, '', {
    ...posCookieOptions,
    httpOnly: false,
    maxAge: 0,
  });

  return response;
}
