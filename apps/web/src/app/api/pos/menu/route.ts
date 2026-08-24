import { NextResponse, type NextRequest } from 'next/server';

import { apiBase } from '@/lib/server-session';
import { pairedTerminalFrom, POS_SHIFT_COOKIE } from '@/lib/pos-session';

/**
 * The board, and the questions about one dish.
 *
 * Both proxied through here because the shift token is httpOnly — the page
 * cannot send what it cannot read. `?menu_item=` switches to the questions for
 * one dish rather than being a second route: the two reads share every line of
 * plumbing and differ only in the path they forward to.
 */
export async function GET(request: NextRequest) {
  const terminal = pairedTerminalFrom(request);
  const shift = request.cookies.get(POS_SHIFT_COOKIE)?.value;

  if (terminal === null || shift === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 409 });
  }

  const params = request.nextUrl.searchParams;
  const menuItem = params.get('menu_item');
  const channel = params.get('channel') ?? 'dine_in';

  const path =
    menuItem === null
      ? `/pos/menu?channel=${encodeURIComponent(channel)}`
      : `/pos/menu/${encodeURIComponent(menuItem)}/questions`;

  try {
    const upstream = await fetch(`${apiBase()}${path}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${shift}`,
        'X-Tenant': terminal.tenantSlug,
      },
      cache: 'no-store',
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: 'unavailable' }, { status: 503 });
    }

    return NextResponse.json(await upstream.json());
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
