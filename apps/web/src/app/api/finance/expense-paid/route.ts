import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * Marking a filed expense paid, or putting it back.
 *
 * `PATCH /api/v1/finance/expenses/{id}` with a `paid_at`, forwarded with the
 * reader's own token — a client component cannot reach the API directly,
 * because the session lives in an httpOnly cookie only Node can read.
 *
 * ---------------------------------------------------------------------------
 * A boolean here, a timestamp upstream
 *
 * The screen's control is a chip with two states and the ledger records WHEN
 * the money left, which is the more useful fact and the one an accountant is
 * asked about. The conversion happens here rather than in the browser for the
 * usual reason: a client's clock is the reader's clock, and an invoice marked
 * paid from a laptop whose date is wrong would be filed into a month that has
 * already been closed. Node's clock is the platform's.
 *
 * `null` is the other direction and is sent explicitly. Omitting the key would
 * mean "leave it as it was" — `UpdateExpenseRequest` uses `sometimes` — so a
 * chip that only ever closed would be the result, and the row it sits on is
 * money the restaurant is about to report as owed.
 *
 * A POST from the browser, a PATCH upstream. Every write from this console goes
 * out as a POST to its own route handler (`lib/console-post.ts` sends nothing
 * else) and the handler speaks whatever verb the API wants.
 */
type Body = { id?: unknown; paid?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const id = whole(body.id);

  if (id === null) return badRequest('invalid_id');

  if (typeof body.paid !== 'boolean') return badRequest('invalid_state');

  return forward(request, `/finance/expenses/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paid_at: body.paid ? new Date().toISOString() : null }),
  });
}
