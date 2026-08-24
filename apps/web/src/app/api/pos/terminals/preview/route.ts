import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * An unsaved idle-screen draft, pushed at a till for a few seconds.
 *
 * The settings panel draws its own preview next to the controls, and that
 * preview cannot answer the only question worth asking: whether the message is
 * readable on a 15-inch screen bolted to a counter in a room with a window. So
 * the draft goes to the screen itself — `POST /api/v1/pos/terminals/{id}/preview`
 * broadcasts it on `terminal.{id}`, which the till already listens on.
 *
 * Proxied for the reason everything here is proxied: the session token is an
 * httpOnly cookie the panel cannot read, and the reader's own token goes up so
 * the API decides on `pos.terminal` against the person actually clicking.
 *
 * Writes nothing upstream. A preview that saved would mean every experiment
 * ships to the counter permanently and the manager finds out from a guest.
 *
 * The id is validated rather than interpolated. It comes from a rendered panel
 * today, but a handler that pastes whatever it is given into a path can be
 * aimed at any endpoint the reader's token happens to reach — and this one
 * lands on a screen in a public room, which is the wrong place to be wrong.
 */
type Body = {
  terminal?: unknown;
  mode?: unknown;
  background?: unknown;
  blocks?: unknown;
  headline?: unknown;
  subline?: unknown;
};

/** `Terminal::IDLE_MODES` and `IDLE_BACKGROUNDS` — the server refuses anything else. */
const MODES = new Set(['minimal', 'status', 'brand']);
const BACKGROUNDS = new Set(['night', 'ink', 'warm', 'photo']);

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const terminal = whole(body.terminal);

  if (terminal === null) return badRequest('invalid_terminal');

  const mode = typeof body.mode === 'string' && MODES.has(body.mode) ? body.mode : 'status';
  const background =
    typeof body.background === 'string' && BACKGROUNDS.has(body.background)
      ? body.background
      : 'night';

  /*
   * Only booleans go through. `blocks` arrives as a record the panel keeps in
   * local state, and the server's rule is `blocks.* => boolean`; passing an
   * object through untouched would turn one stray value into a 422 for a
   * preview that had nothing wrong with it.
   */
  const source = (body.blocks ?? {}) as Record<string, unknown>;
  const blocks: Record<string, boolean> = {};

  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'boolean') blocks[key] = value;
  }

  return forward(request, `/pos/terminals/${terminal}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode,
      background,
      blocks,
      // Trimmed to the server's own maxima so a long line is refused here, in
      // one round trip, rather than after the manager has walked to the till.
      headline: text(body.headline, 80),
      subline: text(body.subline, 160),
      // Long enough to walk to the till and look, short enough to forget about.
      seconds: 20,
    }),
  });
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed.slice(0, max);
}
