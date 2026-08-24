import { NextResponse, type NextRequest } from 'next/server';

import { guestTenant } from '@/lib/api-server';
import { apiBase } from '@/lib/server-session';

/**
 * Where a payment stands — polled by the phone that has just come back from a
 * bank's app.
 *
 * The one leg of the flow that is not a redirect. Payme and Click both hand the
 * browser back with nothing useful in the URL: the authoritative "did it work"
 * is the callback they post to the API, which happens on their schedule and not
 * on the guest's. So the screen asks, every couple of seconds, until the state
 * stops being `pending`.
 *
 * The token in the path is 32 random hex characters minted when the invoice was
 * opened; the row id never leaves the server. That is the whole of the
 * authorisation on an endpoint with no login — see the migration for what an
 * enumerable id would let a stranger read.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ invoice: string }> }) {
  const tenant = await guestTenant();

  if (tenant === null) {
    return NextResponse.json({ error: 'unknown_restaurant' }, { status: 404 });
  }

  const { invoice } = await context.params;

  // Checked here as well as upstream: the segment is forwarded into somebody
  // else's URL, and a token that is not 32 hex characters is not a token this
  // application ever issued.
  if (!/^[0-9a-f]{32}$/.test(invoice)) {
    return NextResponse.json({ error: 'invalid_invoice' }, { status: 400 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/public/payments/${invoice}`, {
      headers: { Accept: 'application/json', 'X-Tenant': tenant },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  const payload: unknown = await upstream.json().catch(() => null);

  return NextResponse.json(payload ?? {}, { status: upstream.status });
}
