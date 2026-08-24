import { NextResponse, type NextRequest } from 'next/server';

import { apiBase } from '@/lib/server-session';
import { pairedTerminalFrom, POS_SHIFT_COOKIE } from '@/lib/pos-session';

/**
 * Handing a stranded shift back, and answering what it asks.
 *
 * Two upstream calls behind one handler, split by `?resolve`:
 *
 *   `POST /api/pos/sync`          → `POST /api/v1/pos/sync/batch`
 *   `POST /api/pos/sync?resolve=1` → `POST /api/v1/pos/sync/resolve`
 *
 * One file because they share everything that matters — both credentials, the
 * tenant header, and the rule that nothing is invented on this side — and differ
 * only in the path. They are also always used together: a drain raises the
 * questions and a resolve answers them, and a reader following one will be
 * reading the other within a minute.
 *
 * **No `X-Pos-Local-Id` header.** Every other POS write carries one minted here;
 * these two must not. The ids are inside the body, one per queued operation,
 * generated on the device at the moment the cashier acted — which is the only
 * moment that can be reconstructed later. A header minted per request would key
 * the idempotency guard on the retry rather than on the sale.
 */
export async function POST(request: NextRequest) {
  const terminal = pairedTerminalFrom(request);
  const shift = request.cookies.get(POS_SHIFT_COOKIE)?.value;

  if (terminal === null || shift === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 409 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const resolving = request.nextUrl.searchParams.get('resolve') !== null;
  const path = resolving ? '/pos/sync/resolve' : '/pos/sync/batch';

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${shift}`,
        'X-Tenant': terminal.tenantSlug,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    /*
     * The network is still down. Answered as its own thing rather than as a
     * rejection: a queue that treated "unreachable" as "refused" would drop a
     * shift's takings the first time a drain was attempted a second too early.
     * The caller keeps the queue and tries again.
     */
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  const payload = (await upstream.json().catch(() => null)) as unknown;

  /*
   * The upstream body is passed through whole, including on a 409.
   *
   * A conflict is not an error to be flattened into a sentence — it carries
   * `conflict_kind` and the ordered `options[]`, and those ARE the screen. The
   * usual "take the message and drop the rest" treatment every other route here
   * gives a failure would leave the till knowing something went wrong and unable
   * to ask anybody about it.
   */
  return NextResponse.json(payload ?? { error: 'unreadable' }, { status: upstream.status });
}
