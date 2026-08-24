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
 * Opening a bill, and adding a line to one.
 *
 * Two writes, one handler, split by whether `?bill=` is present. They share
 * everything that matters — the two credentials, the tenant header, the
 * idempotency key — and differ only in the path and the body, so two files
 * would be one file's worth of plumbing copied twice.
 *
 * Nothing here decides money. The dish id and the modifier ids go up; the
 * priced bill comes back. That is the rule the order screen is built on: a
 * client that could compute a total could disagree with the receipt.
 */
type ApiErrorBody = {
  error?: {
    code?: string;
    message_uz?: string;
    detail?: string;
    errors?: Record<string, string[]>;
  };
};

export async function POST(request: NextRequest) {
  const terminal = pairedTerminalFrom(request);
  const shift = request.cookies.get(POS_SHIFT_COOKIE)?.value;

  if (terminal === null || shift === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 409 });
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const billId = request.nextUrl.searchParams.get('bill');
  const path = billId === null ? '/pos/bills' : `/pos/bills/${encodeURIComponent(billId)}/lines`;

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${shift}`,
        'X-Tenant': terminal.tenantSlug,
        /*
         * Per request, and this is where it earns itself.
         *
         * A waiter on a slow tablet taps a dish twice. Both taps become the
         * same fetch only if the browser retried it; two deliberate taps are
         * two keys and two lines, which is correct — they asked for two. What
         * this stops is one tap becoming two lines because the response was
         * lost on the way back.
         */
        'Idempotency-Key': crypto.randomUUID(),
        /*
         * The device's own id for this operation — the POS module's
         * idempotency, which is not the platform's.
         *
         * Every POS write requires it: it is generated before the tablet knows
         * whether it is online, so an offline queue can replay a whole shift in
         * order and the server can tell a replay from a new sale. Without it
         * the API refuses outright, which is how this was found — a validation
         * error naming a header nothing was sending.
         *
         * A uuid per request for now. When the offline queue lands (P12) the id
         * comes from the queue entry instead, so a replayed tap carries the id
         * it was first given rather than a fresh one.
         */
        'X-Pos-Local-Id': localIdFrom(request),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  if (!upstream.ok) {
    const detail = (await upstream.json().catch(() => null)) as ApiErrorBody | null;

    // The API's own sentence: it already distinguishes a stop-listed dish from a
    // closed bill from a modifier that is not offered, and those are three
    // different things for a waiter to do next.
    return NextResponse.json(
      {
        error: 'rejected',
        code: detail?.error?.code,
        message:
          detail?.error?.detail ??
          detail?.error?.errors?.menu_item_id?.[0] ??
          detail?.error?.message_uz,
      },
      { status: upstream.status },
    );
  }

  return NextResponse.json(await upstream.json());
}

/**
 * Re-read one bill.
 *
 * Needed by exactly one caller and it is worth stating why, because a GET beside
 * these writes looks redundant: after a PART payment the screen has to show what
 * has been paid against the bill, and the settlement response carries the totals
 * rather than the bill's own lines. A cashier reading a stale ticket would take the
 * whole amount a second time.
 */
export async function GET(request: NextRequest) {
  const terminal = pairedTerminalFrom(request);
  const shift = request.cookies.get(POS_SHIFT_COOKIE)?.value;

  if (terminal === null || shift === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 409 });
  }

  const billId = request.nextUrl.searchParams.get('bill');

  if (billId === null || !/^\d+$/.test(billId)) {
    return NextResponse.json({ error: 'invalid_bill' }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${apiBase()}/pos/bills/${billId}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${shift}`,
        'X-Tenant': terminal.tenantSlug,
      },
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
