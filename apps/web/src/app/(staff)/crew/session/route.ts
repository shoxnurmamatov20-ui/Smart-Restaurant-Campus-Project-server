import { NextResponse, type NextRequest } from 'next/server';

import { apiBase } from '@/lib/server-session';

import { CREW_ROLE_COOKIE, crewSurfaceFor } from '@restaurant/surfaces/crew/guard';
import {
  CREW_SESSION_COOKIE,
  crewSessionCookieOptions,
  enrolledPhoneFrom,
} from '../../crew-session';

/**
 * Four digits from an enrolled phone, exchanged for a session.
 *
 * This answered 501 for as long as the staff app existed, naming
 * `POST /api/v1/staff/auth/pin` as the thing that did not exist. It exists now,
 * and this is the seam it was waiting for.
 *
 * **Two credentials, and only one of them ever reaches the browser's script.**
 * The device token is an httpOnly cookie written at enrolment; the PIN arrives
 * in this request and is forwarded once. Neither is readable from JavaScript,
 * which is what makes a four-digit secret on a shared handset acceptable at all.
 *
 * Node calls Laravel rather than the browser doing it, for the reason the
 * console's own session handler documents: a request from the browser to the API
 * is treated as stateful by `SANCTUM_STATEFUL_DOMAINS` and refused with a 419
 * for want of a CSRF token. From Node there is no Origin and no cookie — an
 * ordinary token request.
 */
export async function POST(request: NextRequest) {
  const phone = enrolledPhoneFrom(request);

  if (phone === null) {
    /*
     * The handset has never been enrolled — or was enrolled and then had its
     * code re-issued, which deletes the token. Answered as its own thing so the
     * screen can send the person to a manager rather than telling them their
     * PIN is wrong, which it is not.
     */
    return NextResponse.json({ error: 'not_enrolled' }, { status: 409 });
  }

  let body: { pin?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const pin = typeof body.pin === 'string' ? body.pin : '';

  /*
   * Validated here even though the API validates it too. A malformed PIN must
   * be refused before it reaches a rate limiter that would otherwise count a
   * fat-fingered five-digit entry against a person's five attempts.
   */
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'invalid_pin_format' }, { status: 422 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/staff/auth/pin`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${phone.token}`,
        'X-Tenant': phone.tenantSlug,
        // Every write in this API needs one. A PIN attempt is not idempotent in
        // any useful sense — a retry is a second attempt and must count as one
        // — so the key is fresh per request rather than derived from the digits.
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({ pin }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  const payload = (await upstream.json().catch(() => null)) as {
    token?: string;
    person?: { id: number; name: string; roles: string[] };
    device?: { branch_code?: string | null };
    error?: { code?: string; retry_after_minutes?: number };
  } | null;

  if (!upstream.ok || typeof payload?.token !== 'string') {
    /*
     * The API's own code, passed through rather than flattened.
     *
     * `staff.pin_invalid` and `staff.pin_locked` are two different things for a
     * person to do next — try again, or find a manager — and the lockout
     * carries the wait in minutes so the screen can say it in the reader's own
     * language. A single "rejected" would throw both away.
     */
    return NextResponse.json(
      {
        error: 'rejected',
        code: payload?.error?.code,
        retry_after_minutes: payload?.error?.retry_after_minutes,
      },
      { status: upstream.status },
    );
  }

  const answer = NextResponse.json({
    person: payload.person ?? null,
    branch_code: payload.device?.branch_code ?? null,
  });

  /*
   * The token never leaves this handler except as an httpOnly cookie.
   *
   * A staff phone is passed between two people on one shift and left on a pass
   * where anybody can pick it up. A token readable from script is a token that
   * leaves in the first piece of injected JavaScript; httpOnly is what keeps
   * "somebody used my phone" a physical problem rather than a permanent one.
   */
  answer.cookies.set(CREW_SESSION_COOKIE, payload.token, crewSessionCookieOptions);

  /*
   * Which workspace the PIN opened, beside the token that opened it.
   *
   * The role is in the URL of every screen in this app — `/crew/waiter/tables`
   * — and until this cookie existed nothing compared the two, so a signed-in
   * waiter could type `/crew/owner/branches` and read five branches' revenue
   * and headcount. `middleware.ts` makes that comparison now and it needs
   * something to compare against; the Sanctum token is opaque to Node, so the
   * roles the API just answered with are the only reading available.
   *
   * Written from the response rather than from anything the browser sent, and
   * cleared in the same statement that clears the session — a handset that
   * holds one of the two is a handset the guard cannot reason about, and the
   * guard's answer to that is the keypad.
   *
   * A person with no staff-app surface — a cashier, whose workspace is the till
   * — gets no cookie, and `PinPanel` has already refused them by name. The
   * guard then sends any deep link back to the keypad rather than guessing.
   */
  const surface = crewSurfaceFor(payload.person?.roles ?? []);

  if (surface !== null) {
    answer.cookies.set(CREW_ROLE_COOKIE, surface, crewSessionCookieOptions);
  }

  return answer;
}

/** Signing out at the end of a turn. The enrolment survives — see `crew-session.ts`. */
export async function DELETE(request: NextRequest) {
  const phone = enrolledPhoneFrom(request);
  const session = request.cookies.get(CREW_SESSION_COOKIE)?.value;

  if (phone !== null && session !== undefined) {
    try {
      // Best effort. The cookie is cleared either way: a person who pressed
      // sign out must end up signed out of this handset even if the API is
      // unreachable, and a token nobody holds is revoked at its expiry.
      await fetch(`${apiBase()}/staff/auth/session`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${session}`,
          'X-Tenant': phone.tenantSlug,
          'Idempotency-Key': crypto.randomUUID(),
        },
        cache: 'no-store',
      });
    } catch {
      // Deliberately swallowed — see above.
    }
  }

  const answer = NextResponse.json({ signed_out: true });

  answer.cookies.set(CREW_SESSION_COOKIE, '', { ...crewSessionCookieOptions, maxAge: 0 });
  answer.cookies.set(CREW_ROLE_COOKIE, '', { ...crewSessionCookieOptions, maxAge: 0 });

  return answer;
}
