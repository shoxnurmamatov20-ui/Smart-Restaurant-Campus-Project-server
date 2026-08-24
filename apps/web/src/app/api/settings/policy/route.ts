import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * One house rule, saved to the restaurant's own settings document.
 *
 * The settings screen draws ten policy switches under its eight panels. Six of
 * them are declared paths in `config/settings.php` and this handler writes
 * those six; the other four are drawn because the design draws them and are
 * explained where they are drawn (`settings-panels.tsx`, `POLICY_PATHS`).
 *
 * A named allowlist rather than a passthrough, and that is the point rather
 * than caution: `PATCH /api/v1/settings` writes the document the receipt
 * renderer, the till and the bill totals all read, and a handler that forwarded
 * whatever key it was handed would let a click on this page set the VAT rate.
 * The API refuses an undeclared path, but it cannot know that this screen has
 * no business sending a declared one it does not draw.
 *
 * ---------------------------------------------------------------------------
 * A switch is a boolean; two of these rules are numbers
 *
 * `kds_late_minutes` is minutes and the design draws it as a switch — *"Chek
 * rangi bilan ogohlantirish · 6 daqiqada sariq, 10 daqiqada qizil"*. So the
 * allowlist carries what ON and OFF each mean, and zero is what OFF means for
 * a number: the API reads zero as "no house rule", and the station's own SLA
 * takes over again. The value is decided here rather than on the screen because
 * it is a fact about the API's contract, not about the drawing.
 *
 * ---------------------------------------------------------------------------
 * The body is nested, not a dotted key
 *
 * `policies.kds_late_minutes` is a PATH, and the settings document stores it as
 * `{"policies": {"kds_late_minutes": 10}}`. Sending the dotted string as a
 * literal JSON key would validate — Laravel's schema check matches the pattern
 * either way — and then store a second, parallel key at the document root that
 * every reader would miss. One shape, built here.
 */
type Body = { path?: unknown; on?: unknown };

/** Each writable rule, and what this screen's switch means in each direction. */
const WRITABLE: Readonly<Record<string, { on: boolean | number; off: boolean | number }>> = {
  service_charge_auto: { on: true, off: false },
  'policies.auto_close_table_after_payment': { on: true, off: false },
  'policies.void_sent_needs_manager_pin': { on: true, off: false },
  /*
   * Ten minutes is the design's own red threshold, and it is the number a
   * restaurant gets by switching the row on without opening anything else.
   */
  'policies.kds_late_minutes': { on: 10, off: 0 },
  'policies.kds_paper_docket': { on: true, off: false },
};

/** `a.b` and a value into `{a: {b: value}}` — the shape the document stores. */
function nested(path: string, value: boolean | number): Record<string, unknown> {
  const parts = path.split('.');

  return parts.reduceRight<Record<string, unknown> | boolean | number>(
    (carried, key) => ({ [key]: carried }),
    value,
  ) as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const path = typeof body.path === 'string' ? body.path : '';
  const rule = WRITABLE[path];

  if (rule === undefined) return badRequest('unknown_policy');
  if (typeof body.on !== 'boolean') return badRequest('invalid_value');

  return forward(request, '/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(nested(path, body.on ? rule.on : rule.off)),
  });
}
