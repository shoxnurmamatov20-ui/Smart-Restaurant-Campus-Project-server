import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * Putting a restaurant on the platform.
 *
 * The one call that creates a tenant, and it does three things at once — the
 * business, its first owner account and its trial — because upstream they are
 * one transaction (`TenantProvisioner`). A console that made them three calls
 * could leave a restaurant with nobody able to sign in to it.
 *
 * `restaurant` is the business name and `name` is the *owner's*, which reads
 * backwards until you see the payload: the tenant row is named by the first and
 * the user row by the second, and the slug is derived from the business name
 * upstream rather than typed here — one place decides what a URL-safe name is.
 *
 * The city the form collects is not stored on the tenant, and that is not an
 * omission: a restaurant has no address column, and the platform list reads
 * the city off whichever venue a restaurant has most of
 * (`OverviewController::city`). It is sent, though — it becomes the city of
 * the first venue, which is provisioned with the tenant. That venue is why the
 * console works at all on day one: staff, tables, tills and tickets all carry
 * `branch_id`, and the first restaurant onboarded here got none, so its owner
 * could not save a single employee.
 *
 * The generated password comes back in the answer and nowhere else, ever — the
 * same rule the terminal pairing code follows. The screen has to show it before
 * the operator navigates away.
 */
type Body = {
  restaurant?: unknown;
  owner?: unknown;
  email?: unknown;
  phone?: unknown;
  planKey?: unknown;
  city?: unknown;
};

/** The three the plan table ships with; anything else is refused upstream anyway. */
const PLAN_KEYS: readonly string[] = ['start', 'growth', 'enterprise'];

const trimmed = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/**
 * A phone the API's own rule accepts: an optional `+` and nine to fifteen
 * digits.
 *
 * The form's placeholder is `+998 90 000 00 00` and people type it that way, so
 * the spaces are taken out here rather than being sent and refused. A number
 * that survives none of this is dropped rather than rejected — the field is
 * optional, and losing a whole restaurant over a mistyped phone would be a
 * worse trade than an owner record with no number in it.
 */
function phoneNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const compact = value.replace(/[^\d+]/g, '');

  return /^\+?\d{9,15}$/.test(compact) ? compact : null;
}

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const restaurant = trimmed(body.restaurant);
  const owner = trimmed(body.owner);
  const email = trimmed(body.email);

  // Checked here as well as upstream so the sheet can keep the operator's
  // typing: a round trip that comes back "email is required" has already cost
  // them the form once, and the API's own message names a field the form calls
  // something else.
  if (restaurant === null || owner === null || email === null) {
    return badRequest('incomplete');
  }

  const planKey =
    typeof body.planKey === 'string' && PLAN_KEYS.includes(body.planKey) ? body.planKey : null;

  return forward(request, '/platform/tenants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurant,
      name: owner,
      email,
      phone: phoneNumber(body.phone),
      plan_key: planKey,
      city: trimmed(body.city),
      // `locale`, `timezone`, `country` and `trial_days` are deliberately not
      // sent. Every one has a default upstream — `uz`, Asia/Tashkent, UZ, and
      // the platform's own configured trial length — and sending the console's
      // idea of them would quietly override the setting an operator changed on
      // /platform/settings.
    }),
  });
}
