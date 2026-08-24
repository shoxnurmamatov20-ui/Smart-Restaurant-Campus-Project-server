import { NextResponse, type NextRequest } from 'next/server';

/**
 * The action's own id, minted by the *client*.
 *
 * `X-Pos-Local-Id` is the POS module's idempotency and it identifies an
 * **action**, not an HTTP request. Minting it here — one fresh uuid per
 * request — undid the whole mechanism: a waiter who taps Send, loses the
 * answer and taps again sends two different ids, and the server has no way to
 * know it is the same docket. It fires twice and the kitchen cooks twice.
 *
 * So it comes off the request when the caller supplies one, and is only minted
 * here as a fallback for a caller that has not been updated yet. The offline
 * queue supplies the id it first gave the entry, which is what makes a replayed
 * shift replay rather than duplicate.
 */
const localIdFrom = (request: NextRequest): string =>
  request.headers.get('X-Pos-Local-Id') ?? crypto.randomUUID();

import { apiBase } from '@/lib/server-session';
import { pairedTerminalFrom, POS_SHIFT_COOKIE } from '@/lib/pos-session';

/**
 * Sending a bill to the kitchen.
 *
 * `POST /api/pos/send?bill=41` → `POST /api/v1/pos/bills/41/send`. Its own
 * handler rather than a third mode on ../bill/route.ts, because it is a
 * different act: that one builds a bill, this one commits it. A cook starts
 * cooking on the far side of this call, and a waiter who cannot tell the two
 * apart on the screen should at least find them apart in the code.
 *
 * Re-sending an edited bill is allowed and expected — a guest adds a dessert
 * after the mains have gone, and the API updates the existing docket in place
 * rather than putting a second one on the pass. That is why this carries a fresh
 * key each time rather than one keyed on the bill: two deliberate sends are two
 * operations, and the key exists to collapse a retry, not an intention.
 */
export async function POST(request: NextRequest) {
  const terminal = pairedTerminalFrom(request);
  const shift = request.cookies.get(POS_SHIFT_COOKIE)?.value;

  if (terminal === null || shift === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 409 });
  }

  const billId = request.nextUrl.searchParams.get('bill');

  if (billId === null || !/^\d+$/.test(billId)) {
    return NextResponse.json({ error: 'invalid_bill' }, { status: 400 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/pos/bills/${billId}/send`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${shift}`,
        'X-Tenant': terminal.tenantSlug,
        'Idempotency-Key': crypto.randomUUID(),
        // The POS module's own key, which is not the platform's. Every till
        // write requires it: an offline queue replays a whole shift in order,
        // and the server has to be able to tell a replay from a new sale.
        'X-Pos-Local-Id': localIdFrom(request),
      },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  if (!upstream.ok) {
    const detail = (await upstream.json().catch(() => null)) as {
      error?: { code?: string; detail?: string; message_uz?: string };
    } | null;

    // The API's own sentence. An empty bill, a bill somebody else already
    // settled and a stop-listed dish are three different things for a waiter to
    // do next, and it already distinguishes them.
    return NextResponse.json(
      {
        error: 'rejected',
        code: detail?.error?.code,
        message: detail?.error?.detail ?? detail?.error?.message_uz,
      },
      { status: upstream.status },
    );
  }

  return NextResponse.json(await upstream.json());
}
