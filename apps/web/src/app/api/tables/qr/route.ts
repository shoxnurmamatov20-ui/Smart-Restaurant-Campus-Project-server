import { NextResponse, type NextRequest } from 'next/server';

import { apiBase, SESSION_COOKIE } from '@/lib/server-session';

/**
 * The QR square for one table, on its way to a printer.
 *
 * `?id=412` becomes `GET /api/v1/tables/tables/412/qr`. Proxied for the reason
 * everything in this app is proxied: the session token is an httpOnly cookie the
 * browser cannot read, so a floor screen cannot ask Laravel itself — and the
 * host's own token goes up, so the API decides on `tables.view` against the
 * person actually standing at the door.
 *
 * The id is checked against a digit pattern rather than passed through. It
 * arrives in a URL, and a URL is something anybody can type; interpolating it
 * unchecked would let this handler be aimed at any GET endpoint the reader's
 * token happens to reach.
 *
 * The whole payload comes back rather than only the SVG — the console prints
 * the square *and* the table's own label beside it, because a sheet of
 * twenty-four identical squares is a sheet somebody sticks on the wrong tables.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get('id');

  if (id === null || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'invalid_table' }, { status: 400 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/tables/tables/${id}/qr`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: 'rejected' }, { status: upstream.status });
  }

  return NextResponse.json(await upstream.json());
}
