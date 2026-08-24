import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * The four promises the booking form makes — `PATCH /api/v1/settings`.
 *
 * The switches wrote React state and nothing else, so a restaurant that
 * turned auto-confirm off found bookings still confirming themselves the
 * next morning. Each key is declared in `config/settings.php` under
 * `booking.*`; a path this file does not name is refused here rather than
 * dropped silently upstream, which is what happens to an undeclared path and
 * is exactly how this went unnoticed.
 */
type Body = { rule?: unknown; on?: unknown };

/** The screen's four switch keys, and the settings path each writes. */
const RULE: Readonly<
  Record<string, { path: string; on: boolean | number; off: boolean | number }>
> = {
  auto: { path: 'booking.auto_confirm', on: true, off: false },
  // Two hours, which is what the card promises; off is no reminder at all.
  sms: { path: 'booking.remind_hours_before', on: 2, off: 0 },
  // A deposit from six covers up, which is the party size the card names.
  dep: { path: 'booking.deposit_from_party', on: 6, off: 0 },
  wait: { path: 'booking.waitlist', on: true, off: false },
};

function nested(path: string, value: boolean | number): Record<string, unknown> {
  return path
    .split('.')
    .reduceRight<Record<string, unknown> | boolean | number>(
      (carried, key) => ({ [key]: carried }),
      value,
    ) as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const rule = typeof body.rule === 'string' ? body.rule : '';
  const target = RULE[rule];

  if (target === undefined) return badRequest('unknown_rule');
  if (typeof body.on !== 'boolean') return badRequest('invalid_state');

  return forward(request, '/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(nested(target.path, body.on ? target.on : target.off)),
  });
}
