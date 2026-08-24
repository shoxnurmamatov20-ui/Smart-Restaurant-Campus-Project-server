import { NextResponse, type NextRequest } from 'next/server';

import { crewCall } from '../../crew-proxy';

/**
 * What is behind a barcode — `GET /api/v1/inventory/items?barcode=`.
 *
 * The scan screen reads thirteen digits and this turns them into the
 * restaurant's own ingredient: its id, its name and what is on the shelf. The
 * id is the point — a line without one is a line a receipt cannot be booked
 * from, and `count_submit` and `waste_log` are both keyed on `ingredient_id`.
 *
 * **A code nobody registered is an answer, not an error.** The upstream
 * controller says so in its own note and this route keeps it: an empty list
 * comes back 200 with nothing in it, because a scanner that answered 404 would
 * make an unregistered box look like a broken app. The screen shows the digits
 * it read and says the store does not know them, which is the truth and is
 * exactly what a storekeeper needs to act on.
 *
 * A GET behind a route handler rather than a direct call, for the same reason
 * every other read here is: the session is an httpOnly cookie and the browser
 * has never been able to see it.
 */
export async function GET(request: NextRequest) {
  const code = (request.nextUrl.searchParams.get('code') ?? '').trim();

  // The alphabet of a printed barcode. Checked before the call so a stray
  // keystroke does not become an upstream request with a wildcard in it.
  if (!/^[0-9]{6,32}$/.test(code)) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  }

  const upstream = await crewCall(request, `/inventory/items?barcode=${code}&per_page=5`);

  if (upstream === 'not_signed_in') {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  if (upstream === null) {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  const body = (await upstream.json().catch(() => null)) as unknown;

  return NextResponse.json(body ?? { data: [] }, { status: upstream.status });
}
