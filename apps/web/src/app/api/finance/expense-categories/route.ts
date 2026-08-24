import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * The headings a restaurant files its money under, saved.
 *
 * Three acts on one handler, discriminated by `action`, the same arrangement
 * `api/settings/notify` uses. All three go to `finance.manage` upstream.
 *
 * ---------------------------------------------------------------------------
 * Delete and archive are different requests, and the screen picks
 *
 * `DELETE /finance/expense-categories/{id}` removes a heading nothing has been
 * filed under; a heading with entries answers `finance.category_in_use` and has
 * to be archived instead. The panel already knows the count — it draws it — so
 * it asks for the right one, and the refusal is the belt rather than the plan.
 *
 * The distinction is the whole reason archiving exists: last year's entries keep
 * their heading on every statement they appear in, and no new entry can join
 * them. A delete that cascaded would leave those rows pointing at a code nothing
 * can name, and a P&L reading "1 240 000 so'm, unknown".
 */
const CODE = /^[a-z][a-z0-9_]*$/;

const NAME_MAX = 80;

type Body = {
  action?: unknown;
  /** `create`: the slug the expense row will carry, and what to call it. */
  code?: unknown;
  name?: unknown;
  direction?: unknown;
  /** `archive`: which heading, by code. `remove`: by id, because it is a DELETE. */
  id?: unknown;
};

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  if (body.action === 'archive') return archive(request, body);
  if (body.action === 'remove') return remove(request, body);

  return create(request, body);
}

/** A ninth heading. `direction` separates money out from money in. */
function create(request: NextRequest, body: Body) {
  const code = typeof body.code === 'string' ? body.code.trim().toLowerCase() : '';

  // The code lands in `expenses.category`, a varchar the reports filter on, so
  // it has to survive a URL unchanged. A heading called `Ta'mir & bo'yoq` would
  // come back from `?filter[category]=` different from how it went in, and its
  // entries would vanish from their own heading.
  if (!CODE.test(code)) return badRequest('invalid_code');

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, NAME_MAX) : '';

  if (name === '') return badRequest('invalid_name');

  const direction = body.direction === 'in' ? 'in' : 'out';

  return forward(request, '/finance/expense-categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      // One field on the form, three in the column — the same decision the
      // payment-method handler makes, and for the same reason: an empty `ru`
      // would print nothing at all on a statement read in Russian.
      name: { uz: name, ru: name, en: name },
      direction,
    }),
  });
}

/** Retire a heading that has entries behind it. */
function archive(request: NextRequest, body: Body) {
  const code = typeof body.code === 'string' ? body.code : '';

  // Interpolated into a path, so it is checked here as well as upstream — see
  // `api/settings/printer-test` for why a handler must never put an unchecked
  // string into a URL.
  if (!CODE.test(code)) return badRequest('invalid_code');

  const direction = body.direction === 'in' ? 'in' : 'out';

  return forward(request, `/finance/expense-categories/${code}?direction=${direction}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_archived: true }),
  });
}

/** Remove a heading nobody has used. Refused upstream the moment one has. */
function remove(request: NextRequest, body: Body) {
  const id = whole(body.id);

  if (id === null) return badRequest('invalid_category');

  return forward(request, `/finance/expense-categories/${id}`, { method: 'DELETE' });
}
