import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * Which tenders this restaurant offers, saved.
 *
 * Two acts on one handler, discriminated by `action`, the same arrangement
 * `api/settings/notify` uses: the settings panel does both from one table and a
 * second route would be a second file to keep in step for one branch.
 *
 * ---------------------------------------------------------------------------
 * `method` is an allowlist, not a passthrough
 *
 * The upstream refuses anything outside `Payment::METHODS` — that is where the
 * rule belongs and it is enforced there. It is repeated here because this
 * handler interpolates the value INTO A PATH, and a handler that puts whatever
 * string it is handed into a URL can be aimed at any endpoint the reader's own
 * token happens to reach. `api/settings/printer-test` makes the same argument
 * about an id.
 *
 * The list is the platform's eleven tenders. It is duplicated rather than
 * fetched because a path segment cannot wait for a round trip, and because the
 * failure mode of it drifting is the honest one: a tender the console does not
 * know about simply cannot be edited from this screen.
 */
const TENDERS: ReadonlySet<string> = new Set([
  'cash',
  'card',
  'uzcard',
  'humo',
  'visa',
  'mastercard',
  'payme',
  'click',
  'uzum',
  'corporate',
  'credit',
]);

/** The four shapes a tender can have — `PaymentMethod::KINDS`. */
const KINDS: ReadonlySet<string> = new Set(['cash', 'card', 'online', 'credit']);

const NAME_MAX = 80;

type Body = {
  action?: unknown;
  /** `toggle`: which tender. */
  method?: unknown;
  on?: unknown;
  /** `create`: the three fields the panel's form draws. */
  name?: unknown;
  kind?: unknown;
  fiscal?: unknown;
};

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  return body.action === 'create' ? create(request, body) : toggle(request, body);
}

/**
 * Switch a tender on or off.
 *
 * PATCH upstream, POST from the browser — the house rule for every write in
 * this console, so `console-post.ts` stays one function.
 *
 * The first switch on a tender the restaurant never configured materialises its
 * row; the API does that, not this handler. Which is why the browser sends the
 * METHOD rather than an id: half the rows on that table have no id yet, and a
 * screen that had to decide between POST and PATCH by whether a field it was
 * handed was null would be deciding on an implementation detail.
 */
function toggle(request: NextRequest, body: Body) {
  const method = typeof body.method === 'string' ? body.method : '';

  if (!TENDERS.has(method)) return badRequest('unknown_method');
  if (typeof body.on !== 'boolean') return badRequest('invalid_value');

  return forward(request, `/finance/payment-methods/${method}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_enabled: body.on }),
  });
}

/**
 * Offer a tender this restaurant was not offering.
 *
 * The name is stored as jsonb `{uz, ru, en}` like every user-visible string on
 * the platform, and the form draws one field. All three carry the same word
 * rather than two of them being left empty: a manager typing "Naqd" has said
 * what the till should print, and an empty `ru` would print nothing at all for
 * a Russian-speaking cashier. Translating it properly is a settings edit, not
 * something this handler should invent.
 */
function create(request: NextRequest, body: Body) {
  const method = typeof body.method === 'string' ? body.method : '';

  if (!TENDERS.has(method)) return badRequest('unknown_method');

  const kind = typeof body.kind === 'string' ? body.kind : '';

  if (!KINDS.has(kind)) return badRequest('invalid_kind');

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, NAME_MAX) : '';

  if (name === '') return badRequest('invalid_name');

  return forward(request, '/finance/payment-methods', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method,
      name: { uz: name, ru: name, en: name },
      kind,
      is_fiscal: body.fiscal !== false,
    }),
  });
}
