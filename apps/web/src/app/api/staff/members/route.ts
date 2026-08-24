import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

import { POSITIONS } from '@/app/(dashboard)/staff/staff-data';

/**
 * Hiring somebody — `POST /api/v1/staff/members`, through the session cookie.
 *
 * The console's form asks for a name, a job and a venue, which is what the
 * person filling it in knows. Everything else the table needs either has a
 * default (`status`) or is allocated upstream (`employee_code`), and this
 * route deliberately does not invent any of it: a proxy that quietly adds
 * fields is a proxy whose behaviour has to be discovered rather than read.
 *
 * The positions are checked here as well as upstream, because a select that
 * has drifted from the server's list should fail with a named error rather
 * than a 422 the sheet cannot word.
 */
type Body = {
  firstName?: unknown;
  lastName?: unknown;
  position?: unknown;
  phone?: unknown;
  branchId?: unknown;
};

/** `StaffMember::POSITIONS`, in the order the console's select offers them. */
const POSITION_VALUES = new Set(POSITIONS.map((position) => position.value));

const trimmed = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const firstName = trimmed(body.firstName);
  const lastName = trimmed(body.lastName);
  const position = trimmed(body.position);
  const phone = trimmed(body.phone);

  if (firstName.length < 2 || firstName.length > 120) return badRequest('invalid_name');
  if (lastName.length < 2 || lastName.length > 120) return badRequest('invalid_name');
  if (!POSITION_VALUES.has(position)) return badRequest('invalid_position');

  // A venue is optional: a one-venue restaurant does not ask, and a person
  // recorded against none is visible from every one of them — which is the
  // same rule every other branch-scoped read follows.
  const branchId =
    typeof body.branchId === 'string' && /^[0-9]+$/.test(body.branchId)
      ? Number(body.branchId)
      : null;

  return forward(request, '/staff/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      first_name: firstName,
      last_name: lastName,
      position,
      phone: phone === '' ? null : phone,
      branch_id: branchId,
    }),
  });
}
