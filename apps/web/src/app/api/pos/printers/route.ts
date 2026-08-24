import { NextResponse, type NextRequest } from 'next/server';

import { apiBase } from '@/lib/server-session';
import { pairedTerminalFrom, POS_SHIFT_COOKIE } from '@/lib/pos-session';

/**
 * Whether the paper is coming out.
 *
 * The till's health strip asks this on a timer, and it is the one chip on that
 * strip nothing else in the browser can answer: the network and the live link
 * are visible from the tablet, a printer in the back office is not. A cashier
 * finds out about a jam two orders later otherwise, which is two guests
 * standing at the counter with no receipt.
 *
 * `GET /api/v1/kitchen/printers/health` answers for the whole venue in two
 * queries — it is built to be polled from every till in the building — and it
 * is guarded by `pos.view|kitchen.view`, which is why a cashier's own shift
 * token reaches it and why this handler sends that rather than a device token.
 * A device token carries no permissions at all.
 *
 * Narrowed to the three figures the strip draws. The payload also carries a row
 * per printer with its last error and its queue depth; that is a settings
 * screen's business, and shipping it to a tablet in a dining room is shipping
 * the venue's hardware inventory to a screen anybody can read over.
 */
export async function GET(request: NextRequest) {
  const terminal = pairedTerminalFrom(request);
  const shift = request.cookies.get(POS_SHIFT_COOKIE)?.value;

  if (terminal === null || shift === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 409 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/kitchen/printers/health`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${shift}`,
        'X-Tenant': terminal.tenantSlug,
      },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: 'rejected' }, { status: upstream.status });
  }

  const body = (await upstream.json().catch(() => null)) as {
    state?: string;
    queued?: number;
    failed?: number;
  } | null;

  if (body === null) return NextResponse.json({ error: 'unreadable_answer' }, { status: 502 });

  return NextResponse.json({
    state: body.state ?? 'none',
    queued: body.queued ?? 0,
    failed: body.failed ?? 0,
  });
}
