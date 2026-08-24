import { NextResponse, type NextRequest } from 'next/server';

import { apiBase, SESSION_COOKIE } from '@/lib/server-session';

/**
 * Testing the link to the fiscal module.
 *
 * `GET /finance/fiscal/probe` answers with whether the driver is enabled, what
 * it says about itself, how long the declaration window is, and how many
 * receipts are waiting. All four matter on the setup wizard: a restaurant
 * setting itself up wants to know the box is reachable *before* it takes a
 * payment, not on the first receipt of the first evening.
 *
 * Through Node for the usual reason — the session token is httpOnly and a
 * browser-to-Laravel request would be treated as stateful and refused for CSRF.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  try {
    const upstream = await fetch(`${apiBase()}/finance/fiscal/probe`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
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
