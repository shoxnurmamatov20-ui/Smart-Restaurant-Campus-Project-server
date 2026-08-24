import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * A console password for one desk-position member — shown once with the
 * login they will type. `POST /api/v1/staff/members/{member}/password`,
 * through the session cookie. The server refuses floor positions; this
 * handler forwards and keeps nothing.
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

  return forward(request, `/staff/members/${memberId}/password`, { method: 'POST' });
}
