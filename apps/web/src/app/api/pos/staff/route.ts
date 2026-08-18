import { NextResponse, type NextRequest } from 'next/server';

import { apiBase } from '@/lib/server-session';
import { pairedTerminalFrom, type PosStaff } from '@/lib/pos-session';

/**
 * Who this till will let sign in.
 *
 * Proxied rather than called from the page for the usual reason: the device
 * token lives in an httpOnly cookie so the room cannot read it, which also
 * means the page cannot send it.
 *
 * The API answers names, roles and whether a PIN is locked out — and nothing
 * else. That restraint is the point: this list is on a screen anybody in the
 * building can read, so it must not be worth reading.
 */
export async function GET(request: NextRequest) {
  // Off the request, not the ambient store — see pairedTerminalFrom for why a
  // route handler should not reach for `cookies()`.
  const terminal = pairedTerminalFrom(request);

  if (terminal === null) {
    return NextResponse.json({ error: 'not_paired' }, { status: 409 });
  }

  try {
    const upstream = await fetch(`${apiBase()}/pos/auth/staff`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${terminal.token}`,
        'X-Tenant': terminal.tenantSlug,
      },
      cache: 'no-store',
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: 'unavailable' }, { status: 503 });
    }

    const body = (await upstream.json()) as { staff?: PosStaff[]; data?: PosStaff[] };

    return NextResponse.json({ staff: body.staff ?? body.data ?? [] });
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
