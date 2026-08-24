import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * Inviting a platform operator — `POST /api/v1/platform/team`.
 *
 * A name and an address; the API mints the password and answers it once,
 * the same rule as a new restaurant's owner. What comes back here goes to
 * the screen and nowhere else: the invite sheet shows it to the person
 * sitting at the console, who hands it over — there is no mail on this
 * platform until `MAIL_MAILER` is real (docs/GO-LIVE.md), and an invite that
 * waited for mail would be an invite nobody received.
 */
type Body = { name?: unknown; email?: unknown };

const trimmed = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const name = trimmed(body.name);
  const email = trimmed(body.email);

  if (name.length < 2 || name.length > 160) return badRequest('invalid_name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190)
    return badRequest('invalid_email');

  return forward(request, '/platform/team', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email }),
  });
}
