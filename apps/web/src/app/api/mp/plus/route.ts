import { type NextRequest } from 'next/server';

import { mpForward } from '@/lib/mp-proxy';
import { badRequest, jsonBody } from '@/lib/api-proxy';

/**
 * Buying MyPOS Plus, and giving it back.
 *
 * `POST /api/v1/mp/plus/subscribe` and `POST /api/v1/mp/plus/cancel` upstream,
 * behind one door because they are the same request with a different path and
 * the same credential — the consumer's token, which is httpOnly and therefore
 * unreadable by the sheet that raises this. The action is a key into the table
 * below rather than a fragment from the body, so a caller cannot reach a path
 * this file does not name.
 *
 * ---------------------------------------------------------------------------
 * What "subscribe" buys, and what it does not
 *
 * One month, and an invoice for it. There is no standing order behind this and
 * the sheet must not imply one: a recurring card mandate is a contract with
 * Payme or Click, not an endpoint, and `App\Contracts\Finance\PaymentGateway`
 * describes one-off invoices. So the platform raises one invoice a month and
 * the copy says the subscription is renewed monthly — which is true, and is
 * also what a guest who cancels needs to have been told.
 *
 * The two refusals are kept apart because they mean opposite things. `422
 * marketplace.plus_already_active` is somebody double-tapping a subscription
 * they already hold — nothing is wrong and nothing was charged twice. `502
 * marketplace.plus_payment_unavailable` is the payment provider being down,
 * which is worth trying again in a minute. Flattening them into one message
 * would have a guest cancelling a live subscription to fix a problem they do
 * not have.
 */
type Action = 'subscribe' | 'cancel';

type Body = { action?: unknown };

const PATHS: Readonly<Record<Action, string>> = {
  subscribe: '/mp/plus/subscribe',
  cancel: '/mp/plus/cancel',
};

const isAction = (value: unknown): value is Action => typeof value === 'string' && value in PATHS;

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null || !isAction(body.action)) return badRequest('invalid_body');

  /*
   * No body upstream. The price is the platform's — `PLUS_MONTHLY`, 39 000
   * so'm — and a subscribe that carried an amount would be a guest naming what
   * they pay. The plan, the term and the renewal date all come back in the
   * answer instead.
   */
  return mpForward(request, PATHS[body.action], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}
