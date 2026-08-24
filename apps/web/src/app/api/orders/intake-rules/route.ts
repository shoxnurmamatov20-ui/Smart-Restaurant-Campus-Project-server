import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * How the intake desk behaves when nobody is watching it.
 *
 * The four automation switches and the prep-time picker on the channels tab.
 * They used to write React state: the screen said "switched on", the next
 * reload said the opposite, and an operator who believed prepaid tickets were
 * reaching the kitchen by themselves stopped watching the queue.
 *
 * POST here, PUT upstream — the house rule that keeps `console-post.ts` to one
 * function. The body is partial by design: the screen writes one control the
 * moment it is pressed, and a request carrying all six values would let a
 * switch in one card silently rewrite the picker in another with whatever the
 * browser last happened to hold.
 *
 * The bounds are the API's — `prep_minutes` 5–180, `peak_ticket_limit` 1–200 —
 * and are not repeated here. What IS checked here is the shape: a key this
 * screen does not draw must not reach `PUT /v1/orders/intake-rules`, because
 * this handler is the only caller and a body it did not build is a body
 * somebody else wrote.
 */
const RULES: Readonly<Record<string, string>> = {
  auto: 'auto_accept_prepaid',
  stop: 'hide_stopped_online',
  cap: 'pause_at_peak',
  call: 'call_on_cash',
};

type Body = { rule?: unknown; on?: unknown; prepMinutes?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const payload: Record<string, unknown> = {};

  if (typeof body.rule === 'string') {
    const column = RULES[body.rule];

    if (column === undefined) return badRequest('unknown_rule');
    if (typeof body.on !== 'boolean') return badRequest('invalid_body');

    payload[column] = body.on;
  }

  if (body.prepMinutes !== undefined) {
    if (typeof body.prepMinutes !== 'number' || !Number.isInteger(body.prepMinutes)) {
      return badRequest('invalid_body');
    }

    payload.prep_minutes = body.prepMinutes;
  }

  // Nothing to change is a bug in the caller rather than a no-op to forward:
  // an empty body upstream would answer 200 and the screen would report a
  // save that had no subject.
  if (Object.keys(payload).length === 0) return badRequest('nothing_to_change');

  return forward(request, '/orders/intake-rules', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
