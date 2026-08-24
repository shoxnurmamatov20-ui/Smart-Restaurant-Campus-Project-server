import { type NextRequest } from 'next/server';

import { mpForward } from '@/lib/mp-proxy';
import { badRequest, jsonBody } from '@/lib/api-proxy';

/**
 * What a marketplace customer lets the platform send them.
 *
 * `PATCH /api/v1/mp/me` upstream. Four switches, and each one is a different
 * promise rather than a volume knob: `orders` is the courier is downstairs,
 * `delivery` is the address needs confirming, `promos` is an offer from a shop
 * they have used, `newsletter` is everything else. Collapsing them into one
 * "notifications" toggle is how a guest ends up switching off the message that
 * tells them their food has arrived in order to stop being sold pizza.
 *
 * ---------------------------------------------------------------------------
 * Only the preferences, out of a route that accepts more
 *
 * The endpoint also takes a name and a locale. They are not forwarded from
 * here: this handler is raised by the notifications sheet, and a sheet about
 * four switches that could also rename the account is a sheet that renames the
 * account when a caller passes the wrong object. The language row has its own
 * control and belongs in its own call.
 *
 * All four are sent every time, present or not, so the object upstream is
 * always complete. A partial one would mean "unchanged" on this side and
 * "false" on some future one, and the difference is somebody's order updates
 * going quiet without them having touched anything.
 */
type Body = { notificationPrefs?: unknown };

/** The four the API names. Written out so a fifth cannot arrive by accident. */
const PREFS = ['orders', 'promos', 'delivery', 'newsletter'] as const;

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const asked = body.notificationPrefs;

  if (typeof asked !== 'object' || asked === null) return badRequest('invalid_prefs');

  const source = asked as Record<string, unknown>;
  const prefs: Record<string, boolean> = {};

  for (const key of PREFS) {
    // A non-boolean is refused rather than coerced. `"false"` is truthy, and a
    // switch that reads as on because a caller sent a string is a guest opted
    // into marketing they turned off.
    if (typeof source[key] !== 'boolean') return badRequest('invalid_prefs');

    prefs[key] = source[key];
  }

  return mpForward(request, '/mp/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notification_prefs: prefs }),
  });
}
