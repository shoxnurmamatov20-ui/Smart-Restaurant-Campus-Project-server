import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * A month, shut.
 *
 * `{ period: '2026-07' }` becomes `POST /api/v1/finance/periods/2026-07/close`.
 * Proxied so `finance.manage` is decided against the reader's own token and
 * `closed_by_user_id` records who signed the month off — which is the whole
 * value of a close: the question six months later is not whether the month is
 * locked, it is who locked it and against what figures.
 *
 * ---------------------------------------------------------------------------
 * A month, not an id
 *
 * The screen lists six months and half of them have no database row yet — a
 * month nobody has touched is still a real, closable month — so there is no id
 * to send for the first close a restaurant ever performs. The path segment is
 * the `YYYY-MM`, and the route upstream constrains it to exactly that shape.
 *
 * The same pattern is enforced here rather than trusted from the browser. This
 * handler interpolates its argument into a path with a verb on the end, and a
 * handler that interpolates whatever it is handed can be aimed at any endpoint
 * the reader's token happens to reach — the pattern is what keeps this door
 * pointed at one month of one ledger.
 *
 * ---------------------------------------------------------------------------
 * Close only, never reopen
 *
 * Reopening exists upstream and is deliberately loud: `finance.manage`, a
 * mandatory reason, its own timestamp and its own activity row. This screen
 * draws no control for it, so this handler does not carry one. A reopen route
 * reachable from a console that never asks for a reason would quietly undo the
 * one guarantee closing provides.
 */
type Body = { period?: unknown; note?: unknown };

/** Upstream's `max:255` on the reason, applied before the round trip. */
const NOTE_MAX = 255;

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const period = typeof body.period === 'string' ? body.period : '';

  /* The demo book keys its months `may`, `jun`. Refused here as well as guarded
     on the screen: this is the half no browser can skip. */
  if (!/^\d{4}-\d{2}$/.test(period)) return badRequest('invalid_period');

  const note = typeof body.note === 'string' ? body.note.trim() : '';

  return forward(request, `/finance/periods/${period}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Optional on a close and required on a reopen, upstream. Omitted rather
    // than sent empty, so a month closed without comment has a null note
    // instead of a blank string that reads like somebody typed one.
    body: JSON.stringify(note === '' ? {} : { note: note.slice(0, NOTE_MAX) }),
  });
}
