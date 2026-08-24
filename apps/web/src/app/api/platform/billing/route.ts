import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * The platform's own books: raising an invoice, settling one, retrying one.
 *
 * One handler because the three are the same request with a different path —
 * same credential, same idempotency key, same envelope back. Three files would
 * be this file's plumbing copied twice, and the copies would drift.
 *
 * The action is a key into a fixed table rather than a fragment taken from the
 * body. A caller cannot reach a path this file does not name, which matters
 * because the operator's token is the strongest credential on the product and
 * this route is reachable from a browser.
 *
 * ---------------------------------------------------------------------------
 * There is no payment provider behind any of this
 *
 * `retry` does not re-charge a card: nobody's card is on file. It counts an
 * attempt and moves the row to `overdue` at three, which is what the failing
 * figure on the dashboard counts — a dunning ladder a person walks down, not a
 * gateway. `mark-paid` is the operator saying the bank statement shows it
 * landed; the timestamp comes off the server clock, because the date on an
 * invoice is what an accountant reads back in a year.
 *
 * `issue` is aimed at a *tenant*, not an invoice, because it is the call that
 * creates one. Raising this month twice is not an error and does not answer
 * like one: the unique index on (tenant, period) makes the second attempt
 * return the existing row with `created: false`, which is the honest answer to
 * "has this month been billed".
 */
type Action = 'issue' | 'mark-paid' | 'retry';

type Body = { action?: unknown; tenantId?: unknown; invoiceId?: unknown; period?: unknown };

/** Whether the id this action needs is a tenant's or an invoice's. */
const AIMED_AT: Readonly<Record<Action, 'tenant' | 'invoice'>> = {
  issue: 'tenant',
  'mark-paid': 'invoice',
  retry: 'invoice',
};

const PATHS: Readonly<Record<Action, (id: number) => string>> = {
  issue: (tenant) => `/platform/tenants/${tenant}/invoices`,
  'mark-paid': (invoice) => `/platform/billing/${invoice}/mark-paid`,
  retry: (invoice) => `/platform/billing/${invoice}/retry`,
};

const isAction = (value: unknown): value is Action => typeof value === 'string' && value in PATHS;

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null || !isAction(body.action)) return badRequest('invalid_body');

  const action = body.action;
  const id = whole(AIMED_AT[action] === 'tenant' ? body.tenantId : body.invoiceId);

  /*
   * Checked here as well as upstream. Both screens that reach this route fall
   * back to fixtures when the API is unreachable, and a fixture invoice is a
   * printed number with no key behind it — `INV-2026-814` is a string the demo
   * console made up. Marking one paid is a statement about money, so it may
   * only ever be aimed at a row the server itself sent.
   */
  if (id === null)
    return badRequest(AIMED_AT[action] === 'tenant' ? 'invalid_tenant' : 'invalid_invoice');

  /*
   * The month to bill, when the operator picked one. Left out, the API takes
   * the current month — which is what the card's button means, so the console
   * sends nothing rather than sending its own idea of today. A client-supplied
   * date here would be a client-supplied fact about which month a restaurant
   * owes for.
   */
  const period =
    action === 'issue' && typeof body.period === 'string' && body.period !== ''
      ? body.period
      : null;

  return forward(request, PATHS[action](id), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(period === null ? {} : { period }),
  });
}
