import { NextResponse, type NextRequest } from 'next/server';

import { apiBase } from '@/lib/server-session';

/**
 * The sittings this venue is open for on one date — the booking form's chooser.
 *
 * `GET /api/v1/public/booking-slots?branch_id&date&guests`, forwarded from Node
 * for the one reason a read needs it: a device with no session cannot tell the
 * API which restaurant it is asking about, so the slug from the URL becomes
 * `X-Tenant` here. The same arrangement `./submit/route.ts` explains at length.
 *
 * A read, and everything it publishes is the guest's own business: which
 * instants are still bookable, never how many covers are left. See
 * `PublicBookingSlotController` — a public endpoint that echoed the diary back
 * would let anybody outside the building watch an evening fill up.
 *
 * ---------------------------------------------------------------------------
 * An empty list is an answer, not a failure
 *
 * A venue with no windows configured answers `[]`, and booking windows are a
 * feature a restaurant switches on — which every restaurant on this platform
 * has not. So `[]` means "offer whatever you drew before", and the form falls
 * back to its own fixed times rather than telling a guest the restaurant is
 * closed all week. `{ data: [] }` is what this returns for a refusal too, for
 * the same reason: a chooser that cannot reach the diary must not become a
 * chooser with nothing in it.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ restaurant: string }> },
) {
  const { restaurant } = await params;

  if (restaurant === '') {
    return NextResponse.json({ error: 'unknown_restaurant' }, { status: 404 });
  }

  const asked = request.nextUrl.searchParams;
  const query = new URLSearchParams();

  /*
   * Copied key by key rather than forwarded whole.
   *
   * This handler holds the tenant, so anything that reaches the API from here
   * is asked in a restaurant's name — and a query string taken off a browser
   * and passed through unread is a parameter list somebody else chose.
   */
  for (const key of ['branch_id', 'date', 'guests'] as const) {
    const value = asked.get(key);

    if (value !== null && value !== '') query.set(key, value);
  }

  try {
    const upstream = await fetch(`${apiBase()}/public/booking-slots?${query.toString()}`, {
      headers: { Accept: 'application/json', 'X-Tenant': restaurant },
      cache: 'no-store',
      // Longer than a click and shorter than a guest's patience. A chooser that
      // hangs is worse than one that quietly keeps its fixed times.
      signal: AbortSignal.timeout(4_000),
    });

    if (!upstream.ok) return NextResponse.json({ data: [] });

    const payload = (await upstream.json().catch(() => null)) as { data?: unknown } | null;

    return NextResponse.json({ data: Array.isArray(payload?.data) ? payload.data : [] });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
