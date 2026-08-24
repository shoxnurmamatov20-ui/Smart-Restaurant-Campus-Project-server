import { NextResponse, type NextRequest } from 'next/server';

import { badRequest, forward, forwardRead, jsonBody, whole } from '@/lib/api-proxy';

/**
 * Suspending, resuming or re-planning one restaurant.
 *
 * Three buttons on the tenant card and one endpoint behind them, because
 * upstream they are one `PATCH` — see `UpdatePlatformTenantRequest`, where
 * every field is `sometimes`. Splitting them into three routes here would be
 * three ways to write the same row, and the third one written would be the one
 * that forgot the audit properties.
 *
 * Suspension is the whole mechanism and it is reversible on purpose: a
 * suspended tenant keeps every row and loses every login, because
 * `ResolveTenant` resolves active tenants only. Nothing is deleted, so
 * `status: 'active'` puts a paying customer back in business in one request.
 *
 * `archived` is *not* accepted here. It is the same column, but it is the end
 * of a customer relationship rather than a pause in one, and it has its own
 * door with its own confirmation — `../tenant-archive/route.ts`. One route that
 * could do both would put "delete this restaurant" one typo away from
 * "suspend it".
 */
type Body = { tenantId?: unknown; status?: unknown; planKey?: unknown };

const PLAN_KEYS: readonly string[] = ['start', 'growth', 'enterprise'];

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const tenantId = whole(body.tenantId);

  /*
   * Checked here as well as upstream, because this console falls back to
   * fixtures whenever the API is unreachable and those rows are keyed by slug
   * with no numeric id at all. Without this a tap on the demo list would send
   * something invented, and the worst version of that is a valid id belonging
   * to a different restaurant.
   */
  if (tenantId === null) return badRequest('invalid_tenant');

  const status = body.status === 'active' || body.status === 'suspended' ? body.status : null;
  const planKey =
    typeof body.planKey === 'string' && PLAN_KEYS.includes(body.planKey) ? body.planKey : null;

  // Nothing to change is a bug in the caller, not an empty success: a PATCH
  // with no fields still writes an audit row saying somebody changed something.
  if (status === null && planKey === null) return badRequest('nothing_to_change');

  return forward(request, `/platform/tenants/${tenantId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(status === null ? {} : { status }),
      ...(planKey === null ? {} : { plan_key: planKey }),
    }),
  });
}

/**
 * One restaurant, in full — `GET /platform/tenants/{tenant}`.
 *
 * The list endpoint answers a row per restaurant and the card needs more than a
 * row: the venues, the people, the invoices. Fetching all of that for
 * forty-two customers so one card can open is the wrong trade, so the card asks
 * for its own when it opens.
 *
 * It exists because the card was reading those three things out of
 * `TENANT_DETAIL` — a fixture keyed by the demo slugs. For every restaurant
 * actually onboarded here that lookup missed, and the card drew an empty venue
 * table beside a staff list generated from a pool of invented names with
 * invented last-seen times. An operator answering a customer's question was
 * reading a console that had made the answer up.
 *
 * 502 rather than a fixture when the API cannot be reached. The read half of
 * this console falls back on purpose — a page that still renders during an
 * outage is worth having — but that reasoning applies to a screen being drawn,
 * not to a detail somebody pressed for. Here the honest answer is that it could
 * not be fetched, and the card says so.
 */
export async function GET(request: NextRequest) {
  const tenantId = whole(Number(request.nextUrl.searchParams.get('tenantId')));

  if (tenantId === null) return badRequest('invalid_tenant');

  const answer = await forwardRead<{ data?: unknown }>(request, `/platform/tenants/${tenantId}`);

  if (answer === null) {
    return NextResponse.json({ error: 'unavailable' }, { status: 502 });
  }

  return NextResponse.json(answer);
}
