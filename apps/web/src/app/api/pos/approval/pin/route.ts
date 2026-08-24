import { NextResponse, type NextRequest } from 'next/server';

import { apiBase } from '@/lib/server-session';
import { pairedTerminalFrom, POS_SHIFT_COOKIE } from '@/lib/pos-session';

/**
 * The manager who walked over, answering on the tablet in the waiter's hand.
 *
 * The sibling of ../route.ts, which only *raises* a request. Answering one from
 * somewhere else — the office, the car park, the other branch — happens on the
 * manager's own token against `POST /pos/approvals/{id}/decide`, and that is
 * the case the approval queue was built around. This is the other one, and it
 * is the one a restaurant does forty times a shift.
 *
 * The credential that goes up is the **cashier's** shift token, deliberately.
 * The manager is not signed in at this terminal and must not have to be:
 * signing them in would close the cashier's session, which is per-terminal, and
 * leave the waiter unable to use their own till. `pos.approve` is checked
 * server-side against the person whose PIN was typed — the only place it can
 * be — and `user_id` says who that is rather than the server searching four
 * digits against a roster.
 *
 * The PIN never reaches Laravel from the browser. It comes here, and this
 * handler adds the two things the page cannot read: the shift token and the
 * device's tenant.
 */
type Body = {
  approvalId?: unknown;
  userId?: unknown;
  pin?: unknown;
  approved?: unknown;
};

const whole = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;

export async function POST(request: NextRequest) {
  const terminal = pairedTerminalFrom(request);
  const shift = request.cookies.get(POS_SHIFT_COOKIE)?.value;

  if (terminal === null || shift === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 409 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;

  if (body === null) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const approvalId = whole(body.approvalId);
  const userId = whole(body.userId);
  const pin = typeof body.pin === 'string' ? body.pin : '';

  if (approvalId === null) return NextResponse.json({ error: 'invalid_approval' }, { status: 400 });
  if (userId === null) return NextResponse.json({ error: 'invalid_user' }, { status: 400 });

  /*
   * Digits only, and the length the server asks for is the server's business.
   *
   * Checked here so an obviously empty keypad costs no round trip — and no
   * further, because `config('auth.pin.length')` is one value in one place and
   * a second copy of it here would be the copy that is wrong the day it moves.
   */
  if (!/^\d{4,8}$/.test(pin)) return NextResponse.json({ error: 'invalid_pin' }, { status: 400 });

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/pos/approvals/${approvalId}/pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${shift}`,
        'X-Tenant': terminal.tenantSlug,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        user_id: userId,
        pin,
        // Required by the API rather than defaulted, so a refusal has to be
        // typed as deliberately as an approval — see ApproveWithPinRequest.
        approved: body.approved === true,
      }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  const answer = (await upstream.json().catch(() => null)) as {
    error?: { code?: string; message_uz?: string; detail?: string };
  } | null;

  if (!upstream.ok) {
    /*
     * The API's own code and sentence.
     *
     * The code is what the sheet branches on: a wrong PIN is retried on the
     * spot, and `pos.approval_self` — the person who asked cannot be the
     * person who agrees — is the one refusal no amount of retyping fixes.
     */
    return NextResponse.json(
      {
        error: 'rejected',
        code: answer?.error?.code,
        message: answer?.error?.detail ?? answer?.error?.message_uz,
      },
      { status: upstream.status },
    );
  }

  return NextResponse.json(answer);
}
