import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * Ticking one box on a venue's opening checklist.
 *
 * One item per call, and there is deliberately no "save the whole list"
 * upstream: two managers working down the same list at the same time would each
 * post their own copy of it, and the last one would quietly un-tick the other's
 * work.
 *
 * `done` is explicit rather than a toggle for the same race in miniature — a
 * toggle has to read the current state first, and two presses a second apart
 * would each read "not done" and each set it.
 *
 * The day is in the path upstream because a bar that closes at two in the
 * morning finishes its opening list after midnight; the browser sends the day
 * it is drawing rather than letting the server assume today, so what is ticked
 * is the list that is on screen.
 */
type Body = { day?: unknown; item?: unknown; done?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const day = typeof body.day === 'string' ? body.day : '';
  const item = typeof body.item === 'string' ? body.item.trim() : '';

  // A calendar date and nothing else. The API refuses anything else too, with
  // a code and three sentences; refusing here keeps a mistyped path out of the
  // upstream router entirely.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return badRequest('invalid_day');
  if (item === '' || item.length > 40) return badRequest('invalid_item');
  if (typeof body.done !== 'boolean') return badRequest('invalid_done');

  return forward(request, `/staff/opening-checklist/${day}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item, done: body.done }),
  });
}
