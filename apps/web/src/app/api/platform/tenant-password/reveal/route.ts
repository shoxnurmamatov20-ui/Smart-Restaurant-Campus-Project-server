import { type NextRequest } from 'next/server';

import { badRequest, forwardRead } from '@/lib/api-proxy';

/**
 * Read back the password the platform issued — `GET .../owner-password`.
 *
 * The call this exists for happens all day: a restaurant rings and asks what
 * their password is. Until this, the only move available was to replace it,
 * because `users.password` is a bcrypt hash and nothing turns a hash back into
 * what was typed.
 *
 * What comes back is not "the password" in the general sense. It is the value
 * **this platform issued**, kept encrypted beside the hash — and it is null the
 * moment the owner changes their own, because the API clears it on any password
 * change it did not cause. A console that reads out a stale credential is worse
 * than one that admits it does not know.
 *
 * Its own path under `tenant-password/` rather than a flag on the POST beside
 * it, because the two are different acts with different consequences: that one
 * writes a credential and ends every session the account has, this one reads.
 * A body key that could arrive by accident is not the shape for that difference.
 *
 * The tenant id rides in the query string because this is a GET. Every read is
 * logged upstream with the operator's identity.
 */
/**
 * A positive whole number from the query string.
 *
 * `whole()` in api-proxy takes an unknown from a JSON body, where a number
 * arrives as a number. A query string has only text, so the parse belongs here
 * rather than loosening the shared helper for every POST that uses it.
 *
 * Strict on purpose: `42abc`, `4.2` and `-1` are all refused rather than
 * coerced, because the value picks which restaurant's credential is read.
 */
function tenantKey(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;

  const value = Number(raw);

  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export async function GET(request: NextRequest) {
  const tenantId = tenantKey(request.nextUrl.searchParams.get('tenantId'));

  // A fixture row carries no numeric key, and a guess would read out the
  // credentials of whichever restaurant happens to hold that id.
  if (tenantId === null) return badRequest('invalid_tenant');

  const answer = await forwardRead<{
    owner?: { email?: unknown; password?: unknown; issued_at?: unknown };
  }>(request, `/platform/tenants/${tenantId}/owner-password`);

  // `forwardRead` answers null for a refusal, a timeout or no session at all.
  // Kept as a 502 rather than an empty success: the card has to tell the
  // operator it could not ask, not draw a blank where a password belongs.
  if (answer === null) return badRequest('unavailable');

  return Response.json(answer);
}
