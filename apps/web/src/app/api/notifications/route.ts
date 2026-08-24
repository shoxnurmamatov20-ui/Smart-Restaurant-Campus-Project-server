import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * Clearing the bell.
 *
 * Two shapes down one route, because they are one gesture with two scopes: a
 * row pressed, and the tray's "mark all read". Splitting them into two handlers
 * would be two files that forward the same person's token to the same
 * controller, and the browser half — `Notifications` in
 * `(dashboard)/shell-client.tsx` — would need two paths to remember.
 *
 * A write, so it goes through Node rather than straight at the API: the session
 * token is in an httpOnly cookie by design, and `forward` attaches it along
 * with the `Idempotency-Key` the API requires on everything that changes data.
 * See `lib/api-proxy.ts`.
 *
 * The uuid is checked here as well as upstream. A console with no session draws
 * the design's sample tray, whose rows carry catalogue keys where a real row
 * carries a uuid — `cash_variance` reaching the API would come back a 404 the
 * screen would have to show as a real refusal.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { id?: unknown; all?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  if (body.all === true) {
    return forward(request, '/notifications/read-all', { method: 'POST' });
  }

  const id = typeof body.id === 'string' ? body.id : '';

  if (!UUID.test(id)) return badRequest('invalid_notification');

  return forward(request, `/notifications/${id}/read`, { method: 'PATCH' });
}
