import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * A printer, registered.
 *
 * The settings table's "add" button. `POST /api/v1/kitchen/printers` has
 * existed since P8 — the model, the migration and the spooler are all there —
 * and the console form was the missing half.
 *
 * ---------------------------------------------------------------------------
 * Three fields become eight
 *
 * The design asks for a name, an address and a kind, because that is what
 * somebody standing next to a printer knows. The API asks for a code, a role, a
 * connection and a target as well, and the difference is not paperwork:
 *
 *  - `code` is the stable handle a print route points at, and it is unique per
 *    restaurant. Derived from the name here rather than asked for, because a
 *    manager naming a printer "P-OSHXONA" should not also have to invent
 *    `p-oshxona` and keep the two in step.
 *  - `role` is what the spooler branches on and there are three of them —
 *    kitchen, receipt, label. The table draws four kinds; `bar` is a kitchen
 *    printer standing somewhere else and maps onto `kitchen`, which is exactly
 *    what it is to the code that formats a docket.
 *  - `connection` is inferred from the address: `host:port` is a network head,
 *    anything else is a name only a local agent can resolve.
 */
type Body = {
  name?: unknown;
  /** `192.168.100.152:9100`, or an agent-local device name. */
  target?: unknown;
  /** The table's own four: kitchen · bar · till · pass. */
  kind?: unknown;
};

/** The design's kind against `Printer::ROLES`. */
const ROLES: Readonly<Record<string, string>> = {
  kitchen: 'kitchen',
  bar: 'kitchen',
  till: 'receipt',
  pass: 'label',
};

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const target = typeof body.target === 'string' ? body.target.trim() : '';
  const role = ROLES[typeof body.kind === 'string' ? body.kind : ''] ?? 'kitchen';

  if (name.length < 2 || name.length > 120) return badRequest('invalid_name');
  if (target.length > 190) return badRequest('invalid_target');

  const code = codeFrom(name);

  if (code === '') return badRequest('invalid_name');

  return forward(request, '/kitchen/printers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      name,
      role,
      connection: /:\d{2,5}$/.test(target) ? 'network' : 'agent',
      target: target === '' ? null : target,
    }),
  });
}

/**
 * A code from the name — lowercase, hyphenated, and `[a-z0-9-]` only.
 *
 * Matches `StorePrinterRequest`'s own pattern. A collision comes back as the
 * API's 422 with its own sentence in three languages, which is the right
 * answer: two printers called "P-BAR" is a mistake somebody has to resolve by
 * naming one of them differently, not something a suffix should paper over.
 */
function codeFrom(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}
