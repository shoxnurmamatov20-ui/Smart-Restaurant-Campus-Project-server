import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * Shutting one intake door, or shutting it for an hour.
 *
 * The five switches on the intake screen's channels tab. Their old TODO
 * explained why binding them to `settings.channels` would have been worse than
 * doing nothing: that list holds the four FULFILMENT channels an order row can
 * carry, so two of the five switches would have written the same value and one
 * would have written none — *"a switch quietly bound to the wrong flag is worse
 * than one that does nothing, because it fires."*
 *
 * `orders.channel_settings` is keyed by intake source instead, and this is the
 * write.
 *
 * POST here, PATCH upstream — the house rule that keeps `console-post.ts` to
 * one function. `key` is checked against the five because it becomes a path
 * segment, which is the one thing on this side that is not merely a validation.
 */
const KEYS = ['tel', 'tg', 'web', 'ye', 'uz'] as const;

type Body = { key?: unknown; isOpen?: unknown; pausedMinutes?: unknown; reason?: unknown };

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null || typeof body.key !== 'string') return badRequest('invalid_body');
  if (!(KEYS as readonly string[]).includes(body.key)) return badRequest('unknown_channel');

  const payload: Record<string, unknown> = {};

  if (typeof body.isOpen === 'boolean') payload.is_open = body.isOpen;

  if (typeof body.pausedMinutes === 'number' && Number.isInteger(body.pausedMinutes)) {
    // Zero is "resume now", which is the button beside the pause rather than a
    // pause of no length. Passed through as it arrives.
    payload.paused_minutes = body.pausedMinutes;
    payload.reason = typeof body.reason === 'string' ? body.reason : null;
  }

  if (Object.keys(payload).length === 0) return badRequest('nothing_to_change');

  return forward(request, `/orders/channels/${body.key}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
