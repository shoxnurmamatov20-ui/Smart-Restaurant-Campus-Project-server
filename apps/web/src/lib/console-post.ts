'use client';

/**
 * Writing something from a console screen.
 *
 * The browser half of `lib/api-proxy.ts`: it posts to a route handler on this
 * origin, which forwards the person's own token upstream. Nothing here talks to
 * the API directly, because the session token is in an httpOnly cookie and a
 * token JavaScript can read is a token an injected script can post somewhere.
 *
 * It never throws. Every caller is a click handler, and a rejected promise
 * inside one is an unhandled rejection with no user-visible effect — the button
 * looks like it worked. So the answer is a discriminated result the caller has
 * to look at.
 *
 * `code` is the API's error code when there is one (`stock.insufficient`,
 * `purchase_order.no_lines`), so a screen can branch on the reason rather than
 * on a sentence. `message` is that code's text in the reader's own language,
 * which the API already sends three of.
 */
export type PostResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: string;
      message: string | null;
      /**
       * What the refusal came WITH, when it came with anything.
       *
       * Some refusals are a schedule rather than a no: `marketplace
       * .placement_slot_taken` carries `meta.queue_days`, the number of days
       * until the advertising slot frees. A screen that saw only the code and
       * the sentence would draw "not saved" over the one figure that makes the
       * answer actionable.
       *
       * Untyped on purpose — every code carries something different, and the
       * caller that reads a key is the caller that knows which code it is
       * branching on.
       */
      meta: Record<string, unknown> | null;
    };

type Envelope = {
  /**
   * The API's envelope — or a route handler's own one-word refusal.
   *
   * `lib/api-proxy.ts` answers `{ error: 'not_signed_in' }` when there is no
   * session to forward, so this key is not always an object and every reader
   * here has to say so.
   */
  error?: unknown;
  meta?: unknown;
};

/** The envelope when it is one, rather than a route handler's bare word. */
function objectFrom(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * The six keys the envelope itself owns — API.md §1.
 *
 * Everything else inside `error` is that code's own baggage, because
 * `ApiError::toArray()` ends with `[...$body, ...$meta]` and says why: *"It
 * rides alongside the four fixed keys rather than inside them, so a client that
 * does not know a particular code can still render the message."*
 *
 * So `meta` is what is left after these are taken out. Reading a top-level
 * `meta` — which is what this file did — found one on exactly zero refusals the
 * API sends, and every screen branching on `answer.meta` was branching on null:
 * `pos.approval_required` reached the console with no `approval_id` to re-send,
 * and `marketplace.placement_slot_taken` drew "not saved" over the one figure
 * that made it actionable. `api/pos/bill/action/route.ts` already read the id
 * off `error` for the same reason; this is the same reading, once, for every
 * caller.
 */
const ENVELOPE_KEYS = new Set([
  'code',
  'message_uz',
  'message_ru',
  'message_en',
  'field',
  'retryable',
]);

/**
 * A refusal's baggage, or null when it brought none.
 *
 * Both places are read and the outer one wins on a collision: a route handler
 * that lifted the keys itself — `api/orders/route.ts` copies them up so a
 * browser can reach them — has already decided what the screen should see, and
 * the copy it made is the same object either way.
 */
function metaFrom(envelope: Envelope): Record<string, unknown> | null {
  const beside = Object.entries(objectFrom(envelope.error)).filter(
    ([key]) => !ENVELOPE_KEYS.has(key),
  );

  const meta = { ...Object.fromEntries(beside), ...objectFrom(envelope.meta) };

  return Object.keys(meta).length === 0 ? null : meta;
}

/** Which of the envelope's three sentences to show. */
export type Lang = 'uz' | 'ru' | 'en';

export async function post<T>(
  path: string,
  body: unknown,
  lang: Lang = 'uz',
): Promise<PostResult<T>> {
  let response: Response;

  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // The network, not the API. Kept apart from a refusal because the two need
    // different words: one is "try again", the other is "this cannot be done".
    return { ok: false, code: 'offline', message: null, meta: null };
  }

  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok) return { ok: true, data: payload as T };

  const envelope = (payload ?? {}) as Envelope;
  const error = objectFrom(envelope.error);

  return {
    ok: false,
    code: typeof error.code === 'string' ? error.code : `http_${response.status}`,
    message: sentence(error, lang),
    meta: metaFrom(envelope),
  };
}

function sentence(error: Record<string, unknown>, lang: Lang): string | null {
  const value = error[`message_${lang}`];

  return typeof value === 'string' && value !== '' ? value : null;
}

/** A numeric id from the API, or null for a fixture row that has no real one. */
export function apiId(value: string): number | null {
  return /^\d+$/.test(value) ? Number(value) : null;
}
