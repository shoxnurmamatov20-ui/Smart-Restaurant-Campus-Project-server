import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * The login behind one staff member — opened if missing, PIN rotated either
 * way. `POST /api/v1/staff/members/{member}/login`, through the session cookie.
 *
 * Two console buttons land here and they are the same act on the server:
 * "open a login" for somebody hired before logins came with hiring, and "new
 * PIN" for somebody who forgot theirs. The PIN comes back once and the screen
 * shows it once; this handler keeps nothing.
 */
export async function POST(request: NextRequest) {
  const body = await jsonBody<{ memberId?: unknown }>(request);

  if (body === null) return badRequest('invalid_body');

  const memberId =
    typeof body.memberId === 'string' && /^[0-9]+$/.test(body.memberId)
      ? Number(body.memberId)
      : typeof body.memberId === 'number' && Number.isInteger(body.memberId)
        ? body.memberId
        : null;

  if (memberId === null || memberId < 1) return badRequest('invalid_member');

  return forward(request, `/staff/members/${memberId}/login`, { method: 'POST' });
}
