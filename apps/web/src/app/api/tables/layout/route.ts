import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * Moving one table on the plan — `PATCH /api/v1/tables/tables/{table}`.
 *
 * One tile per call, and that is the shape rather than a limitation. The editor
 * moves a table up or down its room, or into another room; sending the whole
 * floor as one document would mean two managers rearranging different corners
 * of the same evening each posting their own copy of it, and the second would
 * put the first's tables back.
 *
 * `position` may be zero — that is "unplaced", which every table that predates
 * the editor is — so it is bounds-checked here rather than passed through
 * `whole()`, which refuses zero.
 *
 * Neither field is required: a move between rooms sends `hallId` alone and a
 * reorder sends `position` alone. A request with neither is refused rather than
 * forwarded as an empty PATCH, because a write that changes nothing is a write
 * nobody can explain in the audit log.
 */
type Body = { tableId?: unknown; position?: unknown; hallId?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const tableId = whole(body.tableId);

  if (tableId === null) return badRequest('invalid_table');

  const patch: Record<string, number> = {};

  if (body.position !== undefined) {
    const position = body.position;

    if (
      typeof position !== 'number' ||
      !Number.isInteger(position) ||
      position < 0 ||
      position > 9999
    ) {
      return badRequest('invalid_position');
    }

    patch.position = position;
  }

  if (body.hallId !== undefined) {
    const hallId = whole(body.hallId);

    if (hallId === null) return badRequest('invalid_hall');

    patch.hall_id = hallId;
  }

  if (Object.keys(patch).length === 0) return badRequest('nothing_to_change');

  return forward(request, `/tables/tables/${tableId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}
