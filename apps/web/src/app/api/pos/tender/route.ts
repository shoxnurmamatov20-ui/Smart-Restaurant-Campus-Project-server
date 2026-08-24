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
 * Taking the money.
 *
 * `POST /api/pos/tender?bill=41` → `POST /api/v1/pos/bills/41/tenders`.
 *
 * Its own handler, and the most carefully guarded one in this app, because it is
 * the only proxy here whose failure mode is a guest paying twice. The two
 * idempotency headers are what stop that: the platform's `Idempotency-Key` collapses
 * a browser retry, and the POS module's `X-Pos-Local-Id` is what lets an offline
 * queue replay a whole shift in order without settling anything a second time.
 *
 * Nothing here computes money. The tenders go up as the cashier entered them and
 * the response carries the authoritative figures — what was applied, what rounding
 * moved, what change is owed. That is not caution for its own sake: a screen that
 * calculated change itself would eventually disagree with the receipt, in front of
 * a guest, with notes already on the counter.
 */
type Tender = { method: string; amount: number; reference?: string | null; tip?: number };

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

  let body: { tenders?: unknown };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!Array.isArray(body.tenders) || body.tenders.length === 0) {
    return NextResponse.json({ error: 'no_tenders' }, { status: 400 });
  }

  /*
   * Zero amounts are forwarded, not filtered.
   *
   * A cashier who has added a second method and not yet typed into it is mid-thought,
   * not in error, and the quote endpoint drops those itself so the screen can keep
   * showing a running figure while they work. The settlement endpoint refuses them,
   * which is the right answer there.
   */

  /*
   * Narrowed rather than forwarded whole.
   *
   * The API validates this again and is the authority — but a proxy that passed
   * arbitrary JSON through would let a field the API later starts trusting arrive
   * from a browser without anybody here having decided it should. The list is
   * short and explicit for that reason.
   */
  const tenders: Tender[] = (body.tenders as Tender[]).map((tender) => ({
    method: String(tender.method ?? ''),
    amount: Number(tender.amount ?? 0),
    reference:
      typeof tender.reference === 'string' && tender.reference !== '' ? tender.reference : null,
    tip: Number(tender.tip ?? 0),
  }));

  /*
   * A quote and a settlement, one handler, split by `?quote=1`.
   *
   * They share the credentials, the tenant header and the narrowing above, and
   * differ in exactly two things: the path, and whether idempotency headers are
   * sent. A quote writes nothing, so a key on it would consume one for a read — and
   * the till's offline queue counts those.
   */
  const quoting = request.nextUrl.searchParams.get('quote') === '1';
  const path = quoting ? `/pos/bills/${billId}/tender-quote` : `/pos/bills/${billId}/tenders`;

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${shift}`,
        'X-Tenant': terminal.tenantSlug,
        ...(quoting
          ? {}
          : {
              'Idempotency-Key': crypto.randomUUID(),
              'X-Pos-Local-Id': localIdFrom(request),
            }),
      },
      body: JSON.stringify({ tenders }),
      cache: 'no-store',
    });
  } catch {
    /*
     * The one network failure in this app with no safe assumption behind it.
     *
     * A settlement that timed out may or may not have been recorded, so this
     * cannot say "it failed" — it says the answer is unknown, and the screen tells
     * the cashier to check the bill rather than take the money again.
     */
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  if (!upstream.ok) {
    const detail = (await upstream.json().catch(() => null)) as {
      error?: { code?: string; detail?: string; message_uz?: string };
    } | null;

    // The API's own sentence. "Ortiqcha to'lov faqat naqddan qaytariladi" and
    // "Bitta hisobda faqat bitta naqd to'lov bo'ladi" are different things for a
    // cashier to do next, and it already distinguishes them.
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
