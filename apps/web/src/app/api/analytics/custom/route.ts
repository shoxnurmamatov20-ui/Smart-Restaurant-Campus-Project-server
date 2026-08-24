import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * A report somebody built in the dialog, run once.
 *
 * A pass-through, deliberately, for the same reason `settings/site` is one: the
 * whitelist of which columns belong to which base lives in
 * `Modules\Analytics\Services\CustomReports` and is shipped to the console by
 * `GET /analytics/report-columns`. A second copy here would be the one that
 * eventually offers a column the server has dropped.
 *
 * What is checked is only the shape — three fields, one of them a non-empty
 * list — because a body missing them is a bug in this console rather than
 * something a person typed, and it should not cost a round trip.
 */
type Body = { base?: unknown; groupBy?: unknown; period?: unknown; columns?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const { base, groupBy, period, columns } = body;

  if (typeof base !== 'string' || typeof groupBy !== 'string') return badRequest('invalid_body');
  if (!Array.isArray(columns) || columns.length === 0) return badRequest('no_columns');

  return forward(request, '/analytics/reports/custom', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base,
      group_by: groupBy,
      period: typeof period === 'string' ? period : 'month',
      columns: columns.filter((column): column is string => typeof column === 'string'),
    }),
  });
}
