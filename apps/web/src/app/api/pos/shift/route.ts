import { NextResponse, type NextRequest } from 'next/server';

import { apiBase } from '@/lib/server-session';
import { pairedTerminalFrom, POS_SHIFT_COOKIE } from '@/lib/pos-session';

/**
 * Opening the drawer for a shift.
 *
 * Two credentials again: the device token says which till, the shift token says
 * who is counting. The API needs the second — the float is recorded against the
 * person who counted it, and a Z report that could not name them would be a
 * cash difference with nobody attached.
 *
 * `opening_cash` is integer tiyin, counted note by note on the screen. Nothing
 * here re-does that arithmetic: a second place that multiplies notes by values
 * is a second place that can disagree with the drawer.
 */
type ApiErrorBody = {
  error?: { code?: string; message_uz?: string; errors?: Record<string, string[]> };
};

export async function POST(request: NextRequest) {
  const terminal = pairedTerminalFrom(request);
  const shift = request.cookies.get(POS_SHIFT_COOKIE)?.value;

  if (terminal === null || shift === undefined) {
    // Not paired, or nobody signed in. Either way there is no shift to open.
    return NextResponse.json({ error: 'not_signed_in' }, { status: 409 });
  }

  let body: { opening_cash?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const openingCash = Number(body.opening_cash);

  if (!Number.isInteger(openingCash) || openingCash < 0) {
    return NextResponse.json({ error: 'invalid_amount' }, { status: 422 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/pos/shifts/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // The person's token, not the device's: the API records who counted.
        Authorization: `Bearer ${shift}`,
        'X-Tenant': terminal.tenantSlug,
        // Opening a shift is a write, like every other one here. Per request,
        // so a retried fetch cannot open two shifts for one count.
        'Idempotency-Key': crypto.randomUUID(),
        // The device's own id for this write — see the bill handler.
        'X-Pos-Local-Id': crypto.randomUUID(),
      },
      body: JSON.stringify({ opening_cash: openingCash }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  if (!upstream.ok) {
    const detail = (await upstream.json().catch(() => null)) as ApiErrorBody | null;

    return NextResponse.json(
      {
        error: 'rejected',
        code: detail?.error?.code,
        message: detail?.error?.errors?.opening_cash?.[0] ?? detail?.error?.message_uz,
      },
      { status: upstream.status },
    );
  }

  return NextResponse.json(await upstream.json());
}
