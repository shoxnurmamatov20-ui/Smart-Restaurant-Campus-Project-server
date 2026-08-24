import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * Money moved from one place to another, as two rows that point at each other.
 *
 * `POST /api/v1/finance/cash-book/transfers`. The API writes both legs in one
 * transaction, which is the entire reason this is not the till's own drawer
 * movement called twice: a ledger that books the leaving without the arriving
 * shows a loss on a day that made money, and that sentence is printed under the
 * table this button sits on.
 *
 * Proxied so `finance.manage` is decided against the reader's own token, and so
 * the movement's `user_id` names the person who moved the money.
 *
 * ---------------------------------------------------------------------------
 * Accounts on both ends, never a shift
 *
 * Upstream takes either an account or a shift at each end. This door only ever
 * sends accounts, because the console does not know which shift is open at
 * which terminal — the till's own screen does, which is why the cash drop lives
 * there and writes against a named shift. A console that guessed a shift id
 * would attribute a bank transfer to whichever cashier happened to be standing
 * at a drawer, and that figure is what their count is measured against at the
 * end of the night.
 *
 * The ends are checked here rather than left to the API's `required_without`
 * pair: two ids that are the same account is `finance.transfer_same_place`
 * upstream, and a console that can produce it from one dropdown twice should
 * say so without a round trip.
 */
type Body = {
  fromAccountId?: unknown;
  toAccountId?: unknown;
  /** Integer tiyin. The form takes so'm and converts once, in the browser. */
  amountTiyin?: unknown;
  reason?: unknown;
};

/** Upstream's `max:255` on the reason. */
const REASON_MAX = 255;

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const from = whole(body.fromAccountId);
  const to = whole(body.toAccountId);

  if (from === null || to === null) return badRequest('invalid_account');
  if (from === to) return badRequest('same_account');

  const amount = whole(body.amountTiyin);

  if (amount === null) return badRequest('invalid_amount');

  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  /*
   * Required, and not as a formality. A movement with no reason is the row
   * nobody can explain at the month's reconciliation — the panel two tabs to
   * the left of this one — and a blank string would satisfy the API's
   * `required` while being exactly as useless.
   */
  if (reason === '') return badRequest('invalid_reason');

  return forward(request, '/finance/cash-book/transfers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from_account_id: from,
      to_account_id: to,
      amount,
      reason: reason.slice(0, REASON_MAX),
    }),
  });
}
