import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * Moving a table on the floor plan.
 *
 * The one write the console's floor screen owns. Everything else a host reaches
 * for from a table — open the bill, take payment, move the party — happens at a
 * till and belongs to a person who signed in with a PIN; the plan itself is the
 * back office's own object, and a host at the door is exactly who colours it.
 *
 * `POST /api/v1/tables/tables/{id}/status` broadcasts on `branch.{id}.floor`
 * through the model's own hook, so every console, handset and door screen in
 * the building repaints without any of them being told by this handler. That is
 * the whole reason the write is worth having: two hosts cannot seat the same
 * table when the second one watches the first do it.
 *
 * Proxied like every write in this app, because the session token is an
 * httpOnly cookie the browser cannot read. See lib/api-proxy.ts.
 */

/**
 * The four the table row actually holds — `RestaurantTable::STATUSES`.
 *
 * Checked here rather than passed through, and not because the API would accept
 * anything else: the console's own vocabulary has five states (`to_pay` is one
 * of them and is a *bill's* state, not a table's), so a screen that forwarded
 * its own word would 422 on the one square a host taps most.
 */
const STATUSES = ['free', 'occupied', 'reserved', 'cleaning'] as const;

type Body = { tableId?: unknown; status?: unknown };

const isStatus = (value: unknown): value is (typeof STATUSES)[number] =>
  typeof value === 'string' && (STATUSES as readonly string[]).includes(value);

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const tableId = whole(body.tableId);

  // A fixture floor has no ids, and the board refuses before it gets here.
  // Refused again anyway: this is the last gate before a real token goes up.
  if (tableId === null) return badRequest('invalid_table');
  if (!isStatus(body.status)) return badRequest('invalid_status');

  return forward(request, `/tables/tables/${tableId}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: body.status }),
  });
}
