import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * A payroll run, frozen.
 *
 * `{ id: 7 }` becomes `POST /api/v1/staff/payroll/7/finalize`, which re-sums
 * the three totals and stamps the signature inside one transaction, then stops
 * accepting edits to the run. Proxied so the reader's own token decides
 * `staff.manage` upstream and `finalised_by_user_id` names the person who
 * pressed the button rather than the console.
 *
 * The id is checked against a digit pattern rather than passed through: it
 * comes from a rendered row today, and a handler that interpolates whatever it
 * is handed can be aimed at any endpoint the reader's token happens to reach.
 *
 * No body beyond the id, because the act carries no arguments. Every figure
 * being frozen is recomputed upstream at the moment of freezing rather than
 * trusted from the client — this is the point where the totals stop being
 * derivable, so it is the point where they had better come from the rows and
 * not from a screen that rendered them a minute ago.
 *
 * Nothing here writes the bank file. The toast on the screen says the payment
 * list went to the bank and what actually happened is that the run locked; a
 * bank's upload format is a contract with one bank rather than a schema, and
 * it lands the day a restaurant names theirs.
 */
type Body = { id?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const id = whole(body.id);

  /*
   * A fixture payroll table has no run behind it, and the screen falls back to
   * a demo toast rather than posting. Refused here too: this is the half no
   * browser can skip.
   */
  if (id === null) return badRequest('invalid_payroll_run');

  return forward(request, `/staff/payroll/${id}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}
