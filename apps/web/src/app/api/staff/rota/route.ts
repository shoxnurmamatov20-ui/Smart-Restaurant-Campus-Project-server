import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * Handing the week over.
 *
 * Until this is called the rota is the manager's working copy — they drag a
 * cook to Thursday, change their mind on Friday, leave two gaps to fill on
 * Monday. Every one of those edits is already a real row and already visible to
 * the person it names, so a waiter who checked on Tuesday planned around a
 * shift that no longer existed on Wednesday.
 *
 * The range is what is published, not a list of ids: a manager publishes *the
 * week*, and a list would silently leave out the shift they added last and
 * forgot to tick.
 */
type Body = { from?: unknown; to?: unknown };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const from = typeof body.from === 'string' ? body.from : '';
  const to = typeof body.to === 'string' ? body.to : '';

  // Checked here as well as upstream so a screen that lost its week never
  // reaches the API with an empty range — which the API would refuse, and the
  // console would show as a failure the manager cannot act on.
  if (!DATE.test(from) || !DATE.test(to) || to < from) return badRequest('invalid_range');

  return forward(request, '/staff/shifts/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to }),
  });
}
