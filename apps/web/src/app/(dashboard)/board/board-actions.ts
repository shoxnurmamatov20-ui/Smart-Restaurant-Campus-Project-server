'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { apiBase, SESSION_COOKIE } from '@/lib/server-session';

/**
 * The two things this screen writes.
 *
 * Server actions rather than a route handler under `src/app/api`, for the
 * reason the setup wizard gives for the same choice: the session token is in an
 * httpOnly cookie the browser cannot read, so the call has to originate on this
 * side regardless — and these two writes belong to one screen, so they live
 * beside it rather than in the shared handler tree where the next person has to
 * work out who calls them.
 *
 * Both answer a result rather than throwing. Every caller is a click handler,
 * and a rejected promise inside one is an unhandled rejection with no
 * user-visible effect: the button looks like it worked.
 *
 * Both revalidate `/board` on success, because both change what the preview
 * above the tabs should be drawing. A reorder that moved a column and left the
 * picture of the wall alone would be the screen contradicting itself on the one
 * pane it exists to provide.
 */

/** How long a write waits before the console calls it a dropped connection. */
const TIMEOUT_MS = 8_000;

export type BoardWriteResult =
  | { ok: true; pushed: number; screens: number }
  | { ok: false; reason: 'offline' | 'unauthorised' | 'refused' };

const OFFLINE = { ok: false, reason: 'offline' } as const;
const UNAUTHORISED = { ok: false, reason: 'unauthorised' } as const;
const REFUSED = { ok: false, reason: 'refused' } as const;

async function send(path: string, body: unknown): Promise<BoardWriteResult> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  // No session is not a failure to report as one: the fixture console has no
  // token, and its buttons are a demonstration rather than a broken write.
  if (token === undefined) return UNAUTHORISED;

  let response: Response;

  try {
    response = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        /*
         * A key per press. The API requires one on every write, and it is what
         * makes a lost response harmless: a manager who pressed push, saw
         * nothing and pressed again publishes once, not twice.
         */
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // The network, not the API. Kept apart from a refusal because the two need
    // different words: one is "try again", the other is "this cannot be done".
    return OFFLINE;
  }

  if (response.status === 401) return UNAUTHORISED;

  if (!response.ok) return REFUSED;

  const payload = (await response.json().catch(() => null)) as {
    data?: { pushed?: number; screen_count?: number; reordered?: number };
  } | null;

  return {
    ok: true,
    pushed: payload?.data?.pushed ?? payload?.data?.reordered ?? 0,
    screens: payload?.data?.screen_count ?? 0,
  };
}

/**
 * Publish the configuration to the screens.
 *
 * A write plus a broadcast on the API's side: it stamps what has changed and
 * announces it on `branch.{id}.board`, because nobody is standing at a menu
 * board and a television that only picked up a new price on its next reload is
 * a television advertising last week's price to the queue.
 *
 * `pushed: 0` is a success, not a failure — it means the wall was already
 * showing this, which is what a manager pressing the button to check should be
 * told rather than a green tick that claims work was done.
 */
export async function pushBoard(): Promise<BoardWriteResult> {
  const result = await send('/board/push', {});

  if (result.ok) revalidatePath('/board');

  return result;
}

/**
 * Persist the order of the columns.
 *
 * The whole list in one call. Reordering by N patches is N chances to end up
 * with two columns at position 3 — a tab closed halfway, a lost response, a
 * second manager dragging the same list — and each of those draws a wall in an
 * order nobody chose while the console shows the arrows working.
 *
 * The API refuses a list that is not exactly this venue's columns, so a stale
 * tab gets a refusal rather than a partial write.
 */
export async function reorderColumns(ids: readonly number[]): Promise<BoardWriteResult> {
  const result = await send('/board/columns/reorder', { ids });

  if (result.ok) revalidatePath('/board');

  return result;
}
