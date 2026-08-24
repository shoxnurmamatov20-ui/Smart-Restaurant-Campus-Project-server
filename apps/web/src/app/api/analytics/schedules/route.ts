import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * A report somebody wants to stop asking for.
 *
 * The schedule sheet's save button. Its own note named the half people forget —
 * *"a list under Settings to switch them back off … the half that turns an
 * unread weekly report into a rule nobody can find to cancel"* — which is why
 * `GET /analytics/schedules` is read straight by the server component and only
 * the write comes through here.
 *
 * `destinations` is a list of `{channel, target}`, and it is the one field
 * worth being strict about on this side: an empty list would create a job that
 * builds a month of cashflow every Monday and throws it away. The API refuses
 * it too — this saves the round trip and lets the dialog say so immediately.
 */
type Body = {
  kind?: unknown;
  period?: unknown;
  frequency?: unknown;
  branchId?: unknown;
  destinations?: unknown;
  definition?: unknown;
};

type Destination = { channel?: unknown; target?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');
  if (typeof body.kind !== 'string' || typeof body.frequency !== 'string') {
    return badRequest('invalid_body');
  }
  if (!Array.isArray(body.destinations) || body.destinations.length === 0) {
    return badRequest('no_destinations');
  }

  const destinations: { channel: string; target: string }[] = [];

  for (const raw of body.destinations as Destination[]) {
    if (typeof raw.channel !== 'string' || typeof raw.target !== 'string') continue;
    if (raw.target.trim() === '') continue;

    destinations.push({ channel: raw.channel, target: raw.target.trim() });
  }

  if (destinations.length === 0) return badRequest('no_destinations');

  return forward(request, '/analytics/schedules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: body.kind,
      period: typeof body.period === 'string' ? body.period : 'week',
      frequency: body.frequency,
      branch_id: typeof body.branchId === 'number' ? body.branchId : null,
      destinations,
      // Forwarded unchanged: the base, the columns and the grouping are checked
      // against the server's own whitelist, which is the only list that can be
      // right. See analytics/custom/route.ts.
      definition: body.definition ?? null,
    }),
  });
}
