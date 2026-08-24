import { NextResponse, type NextRequest } from 'next/server';

import { apiBase, SESSION_COOKIE } from '@/lib/server-session';

/**
 * One standard report, for the viewer that opens on a click.
 *
 * Proxied rather than fetched from the page, and the reason is the period
 * buttons. The report viewer is a client component — it holds which report is
 * open and which period is chosen in local state — so it cannot call
 * `apiGet()`, which reads an httpOnly cookie that only Node can see. Rendering
 * every period on the server instead would mean four tables per report shipped
 * on a page where a reader opens one.
 *
 * The reader's own token goes up, so the API decides `analytics.view` against
 * the person who actually clicked, and a waiter who reached this URL by hand
 * gets the 403 the console would have given them.
 *
 * `kind` is checked here as well as upstream. They are a closed set and an
 * unchecked segment is a path fragment forwarded into somebody else's URL —
 * cheap to validate, and the failure it prevents is not a validation error.
 */
/**
 * Nine now, not five.
 *
 * `zreport`, `items`, `vat` and `branches` were added when `StandardReports`
 * learned to answer them — four of the six catalogue cards that used to flash
 * "building · it will be emailed to you" and queue nothing. The two that are
 * still absent stay absent on purpose: stock movement needs Inventory, which
 * Analytics may not read, and labour needs per-person attendance, which the
 * Staff contract withholds.
 */
const KINDS = [
  'waiters',
  'dishes',
  'voids',
  'stock',
  'cashflow',
  'zreport',
  'items',
  'vat',
  'branches',
] as const;

const PERIODS = ['today', 'week', 'month'] as const;

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token === undefined) {
    // Not an error the screen shows: the demo console has no session and keeps
    // its sample rows, which is what `live: false` on the page already says.
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  const kind = request.nextUrl.searchParams.get('kind') ?? '';
  const period = request.nextUrl.searchParams.get('period') ?? 'month';

  if (!(KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: 'unknown_report' }, { status: 400 });
  }

  const window = (PERIODS as readonly string[]).includes(period) ? period : 'month';

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/analytics/reports/${kind}?period=${window}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      // Per person and per request. A report cached at the edge would be one
      // restaurant's takings served to the next reader who asked for the same
      // report — the one failure this whole tenancy layer exists to prevent.
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
