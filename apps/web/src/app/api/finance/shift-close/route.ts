import { NextResponse, type NextRequest } from 'next/server';

import { apiBase, SESSION_COOKIE } from '@/lib/server-session';

/**
 * Closing a cash shift.
 *
 * The one write the till page makes, and it goes through Node for the same
 * reason every other console write does: the session token is an httpOnly
 * cookie the browser cannot read, and a request straight from the browser to
 * Laravel would be treated as stateful and refused for CSRF.
 *
 * The denominations go up as well as the total. The server recomputes the sum
 * and will refuse a total that does not match the notes — which is the point of
 * counting by note rather than typing a figure.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const { shift_id: shiftId, ...payload } = body;

  if (typeof shiftId !== 'number' || !Number.isInteger(shiftId) || shiftId < 1) {
    return NextResponse.json({ error: 'invalid_shift' }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${apiBase()}/finance/shifts/${shiftId}/close`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    if (!upstream.ok) {
      const detail = (await upstream.json().catch(() => null)) as {
        error?: { detail?: string; message_uz?: string };
      } | null;

      return NextResponse.json(
        { error: 'rejected', message: detail?.error?.detail ?? detail?.error?.message_uz },
        { status: upstream.status },
      );
    }

    return NextResponse.json(await upstream.json());
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }
}
