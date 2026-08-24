import { NextResponse, type NextRequest } from 'next/server';

import { apiBase } from '@/lib/server-session';
import { pairedTerminalFrom, POS_SHIFT_COOKIE } from '@/lib/pos-session';

/**
 * Raising an approval request from the till.
 *
 * `POST /pos/approvals` is open to anyone at a terminal, and deliberately so:
 * the person asking is a waiter with a guest in front of them, and the person
 * answering is a manager who is somewhere else. This route only raises the
 * request. Answering it happens on the manager's own device against their own
 * token — see `ApprovalController::decide`, which refuses an approval decided
 * by the person who asked for it.
 */
export async function POST(request: NextRequest) {
  const terminal = pairedTerminalFrom(request);
  const shift = request.cookies.get(POS_SHIFT_COOKIE)?.value;

  if (terminal === null || shift === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 409 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${apiBase()}/pos/approvals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${shift}`,
        'X-Tenant': terminal.tenantSlug,
        'Idempotency-Key': crypto.randomUUID(),
        'X-Pos-Local-Id': crypto.randomUUID(),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: 'rejected' }, { status: upstream.status });
    }

    return NextResponse.json(await upstream.json());
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }
}
