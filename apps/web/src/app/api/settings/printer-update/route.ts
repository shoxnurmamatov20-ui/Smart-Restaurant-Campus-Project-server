import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * A printer that already exists, edited from the settings table.
 *
 * The row drew a pencil whose whole behaviour was a toast, so a restaurant
 * setting up its first printers could not change an IP or a station from the
 * console at all — while the test button next to it worked, which made the dead
 * one read as working.
 *
 * A POST here, a `PATCH /api/v1/kitchen/printers/{printer}` upstream. The verb
 * differs because the browser half of this console (`lib/console-post.ts`)
 * speaks POST and nothing else, deliberately: every write from a screen goes
 * through one function that cannot throw inside a click handler. This handler
 * lives beside `printer-test` for the same reason that one does — it is this
 * screen's proxy, not the Kitchen module's.
 *
 * ---------------------------------------------------------------------------
 * What is deliberately not sent
 *
 * `code` — the stable handle a print route points at. Re-deriving it from a
 * renamed printer would repoint a station's dockets at nothing, and a kitchen
 * that silently stops getting paper is the worst failure this table can cause.
 *
 * And anything the sheet did not fill in. Every field upstream is `sometimes`,
 * so an untouched address must be absent rather than `null`: sending the null
 * would unplug the printer.
 */
type Body = {
  id?: unknown;
  name?: unknown;
  /** `192.168.100.152:9100`, or an agent-local device name. */
  target?: unknown;
  /** The table's own four: kitchen · bar · till · pass. */
  kind?: unknown;
};

/** The design's kind against `Printer::ROLES` — the same map the add path uses. */
const ROLES: Readonly<Record<string, string>> = {
  kitchen: 'kitchen',
  bar: 'kitchen',
  till: 'receipt',
  pass: 'label',
};

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const id = whole(typeof body.id === 'string' ? Number(body.id) : body.id);

  if (id === null) return badRequest('invalid_printer');

  const patch: Record<string, unknown> = {};

  if (typeof body.name === 'string') {
    const name = body.name.trim();

    if (name.length < 2 || name.length > 120) return badRequest('invalid_name');

    patch.name = name;
  }

  if (typeof body.target === 'string') {
    const target = body.target.trim();

    if (target.length > 190) return badRequest('invalid_target');

    patch.target = target === '' ? null : target;
    // `host:port` is a network head; anything else is a name only a local agent
    // resolves. The same inference the add path makes, for the same reason.
    patch.connection = /:\d{2,5}$/.test(target) ? 'network' : 'agent';
  }

  if (typeof body.kind === 'string') {
    const role = ROLES[body.kind];

    if (role === undefined) return badRequest('invalid_kind');

    patch.role = role;
  }

  if (Object.keys(patch).length === 0) return badRequest('nothing_to_change');

  return forward(request, `/kitchen/printers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}
