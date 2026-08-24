'use client';

import { useSyncExternalStore } from 'react';

/**
 * What this handset did that the server has not been told about — flow F13.
 *
 * A waiter in a basement dining room keeps working while the network is gone,
 * and this is where the work waits: in order, with the moment it happened,
 * until `drain()` can hand it over to `POST /api/v1/staff/actions` through
 * `crew/actions/route.ts`.
 *
 * The phone build keeps the same list in `apps/mobile/src/crew/queue.ts` and the
 * two agree about everything that reaches the wire — the eight verbs, the
 * `local_id`, the timestamp of the press. What differs is where the list lives,
 * and only because the two platforms offer different places to put it.
 *
 * ---------------------------------------------------------------------------
 * `localStorage`, not React state
 *
 * The failure this exists for takes the page with it. A phone that loses signal
 * mid-service is a phone somebody also locks, drops, or reloads, and a queue
 * held in a component is a shift's work lost to a pull-to-refresh — the exact
 * failure the feature was built to end. The till's own queue reached the same
 * conclusion for the same reason (`(pos)/pos/pos-queue.ts`).
 *
 * The native build cannot do this and says so: its only persistent store is the
 * Keychain, which is for credentials and has a value-size ceiling a day of
 * service would reach. A browser has no such objection.
 *
 * ---------------------------------------------------------------------------
 * Cleared when the person leaves, never merged across two of them
 *
 * A staff handset is passed around a kitchen all evening. The server keys
 * `local_id` per **user**, so a list left behind by whoever had the phone before
 * would be posted under the next person's token and recorded against their name.
 * `clearQueue()` runs on sign-out beside the cookie, and a drain that comes back
 * 401 empties nothing but stops trying — the entries are still somebody's work
 * and the honest answer is to show them, not to guess whose.
 *
 * ---------------------------------------------------------------------------
 * Order is kept, first in first out
 *
 * `QUEUE_COPY.order` says why in the words the screen shows: sent out of order,
 * the kitchen sees a dish after it was cancelled. The batch goes in that order
 * and the server applies it in that order.
 *
 * An entry is sent at most once however many times it is retried. Each carries
 * an `id` that travels as `local_id` and never changes, so a batch resent after
 * a dropped connection writes nothing twice — which is the whole reason the id
 * is minted here rather than there.
 */

/**
 * The ten verbs the server has. Mirrors `StaffAction::KINDS`.
 *
 * The last two are the ones whose whole product is the journal row — a
 * courier's cash declaration and a checklist tick. They are queued like the
 * rest because the phone that ticks off a closing list at half past midnight is
 * the phone least likely to have signal, and because a tick the server never
 * hears is a tick that vanishes with the next lock screen.
 */
export type ActionKind =
  | 'clock_in'
  | 'clock_out'
  | 'table_claim'
  | 'call_resolve'
  | 'count_submit'
  | 'receive_confirm'
  | 'waste_log'
  | 'delivery_status'
  | 'cash_handover'
  | 'checklist_tick';

export type QueueState = 'waiting' | 'sending' | 'failed';

export type QueuedAction = {
  id: string;
  /**
   * Already in the reader's language.
   *
   * Resolved at the moment of the press rather than at render, because what is
   * being recorded is *what the person did*, and they did it while reading one
   * language. A key re-translated later would relabel history if they switched.
   */
  label: string;
  detail: string;
  /** `Date.now()` at the press. Rendered as a clock time by the screen. */
  at: number;
  state: QueueState;
  /**
   * What to send, when the entry is something the server has a verb for.
   *
   * Optional, because not every button on this app has one: a screen still
   * drawing fixture rows has no database id to put in a payload, and an entry
   * carrying an invented one would be refused — telling the person their work
   * did not land when it was never theirs to send. Those entries stay in the
   * list, visible, and `drain()` reports them as unsendable.
   */
  kind?: ActionKind;
  payload?: Record<string, unknown>;
  /** Why the last attempt did not land, as the server's own code. */
  reason?: string;
};

/** What one drain did, for the screen that asked for it. */
export type DrainResult = {
  sent: number;
  refused: number;
  /** Entries with no verb to send — see `kind`. */
  unsendable: number;
  /** Nobody is signed in on this handset any more. */
  signedOut: boolean;
};

type ActionAnswer = {
  data?: {
    results?: readonly { local_id?: string; status?: string; reason?: string }[];
  };
};

/**
 * One key for the whole handset.
 *
 * Not keyed by person: the browser cannot read the httpOnly session and would
 * have to be told who it is by a component, which is a fact that arrives after
 * the first render and can be stale by the second. Clearing on sign-out is the
 * control that actually holds, and it runs in the same handler that drops the
 * cookie.
 */
const STORE_KEY = 'crew:queue';

let actions: readonly QueuedAction[] = [];
let loaded = false;
let serial = 0;

const listeners = new Set<() => void>();

/** Read once, lazily: `localStorage` does not exist while this module is imported on the server. */
function load(): readonly QueuedAction[] {
  if (loaded || typeof window === 'undefined') return actions;

  loaded = true;

  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);

    if (Array.isArray(parsed)) {
      // Anything left `sending` was interrupted by the reload that lost it. It
      // is `failed` now, which is the truth: nobody knows whether it landed,
      // and the `local_id` makes asking again safe.
      actions = (parsed as QueuedAction[]).map((entry) =>
        entry.state === 'sending' ? { ...entry, state: 'failed' as const } : entry,
      );
    }
  } catch {
    // A corrupt or unreadable store is an empty one. Refusing to render the
    // app over a bad JSON string would be a worse outcome than losing a list
    // nothing could have sent anyway.
    actions = [];
  }

  return actions;
}

function publish(next: readonly QueuedAction[]): void {
  actions = next;
  loaded = true;

  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    // Private mode, or a full quota. The list still works for this page.
  }

  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/**
 * Record one action.
 *
 * Returns nothing: the queue is not a request. The third argument is what makes
 * an entry sendable — a verb and its payload — and leaving it off is how a
 * screen says "this is worth showing the person, and there is nothing to post".
 */
export function enqueue(
  label: string,
  detail: string,
  entry?: { kind: ActionKind; payload?: Record<string, unknown> },
): void {
  const current = load();

  serial += 1;

  publish([
    ...current,
    {
      /*
       * Unique across reloads as well as within one page.
       *
       * A bare counter would restart at `q1` after a refresh, and the server
       * keys on this string per person — so the first entry of the new page
       * would collide with the first of the old one and be answered as a
       * duplicate of something that never happened. The timestamp stops that.
       */
      id: `q${Date.now().toString(36)}-${serial}`,
      label,
      detail,
      at: Date.now(),
      state: 'waiting',
      kind: entry?.kind,
      payload: entry?.payload,
    },
  ]);
}

/**
 * Hand everything over.
 *
 * One request for the whole batch rather than one per entry, and in the order
 * they were worked. The server answers per entry — `applied`, or `rejected`
 * with a code — and only the applied ones leave this list. A refusal stays
 * visible with its reason, because the person who logged four kilos of spoiled
 * chicken has to find out that the store would not take it.
 *
 * Nothing is discarded on a network failure. `sending` goes back to `failed`,
 * the entries stay, and the next press tries again with the same ids — which is
 * exactly the case the ids exist for.
 */
export async function drain(): Promise<DrainResult> {
  const current = load();
  const sendable = current.filter((action) => action.kind !== undefined);
  const unsendable = current.length - sendable.length;

  if (sendable.length === 0) {
    // Nothing to post. What is left is shown as failed, which is the truth
    // about it: there is no verb to send it under.
    publish(current.map((action) => ({ ...action, state: 'failed' as const })));

    return { sent: 0, refused: 0, unsendable, signedOut: false };
  }

  publish(
    current.map((action) =>
      action.kind === undefined ? action : { ...action, state: 'sending' as const },
    ),
  );

  let response: Response;

  try {
    response = await fetch('/crew/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: sendable.map((action) => ({
          local_id: action.id,
          kind: action.kind,
          at: new Date(action.at).toISOString(),
          payload: action.payload ?? {},
        })),
      }),
    });
  } catch {
    publish(current.map((action) => ({ ...action, state: 'failed' as const })));

    return { sent: 0, refused: 0, unsendable, signedOut: false };
  }

  /*
   * Signed out, in either of the two shapes that arrives in.
   *
   * The handler answers 401 when the cookies are gone. `middleware.ts` gets
   * there first when the *session* cookie is gone and **redirects** to the
   * keypad — which `fetch` follows, so the response is a 200 of HTML. Checking
   * only `response.ok` would read that as a successful drain and clear a
   * shift's work against a request nobody was signed in for.
   */
  if (response.status === 401 || response.redirected) {
    // The entries are kept — they are still somebody's work — and the screen
    // sends the person back to the keypad.
    publish(current.map((action) => ({ ...action, state: 'failed' as const })));

    return { sent: 0, refused: 0, unsendable, signedOut: true };
  }

  const answer = (await response.json().catch(() => null)) as ActionAnswer | null;

  if (!response.ok || answer === null) {
    publish(current.map((action) => ({ ...action, state: 'failed' as const })));

    return { sent: 0, refused: 0, unsendable, signedOut: false };
  }

  const verdicts = new Map(
    (answer.data?.results ?? []).map((result) => [result.local_id ?? '', result]),
  );

  let sent = 0;
  let refused = 0;

  const remaining: QueuedAction[] = [];

  for (const action of current) {
    const verdict = verdicts.get(action.id);

    /*
     * No verdict means the server never saw it — an entry with no verb, or one
     * the answer left out. It stays, which is the safe direction: a queue that
     * keeps something twice is a nuisance, one that drops something once is a
     * write-off nobody can account for.
     */
    if (verdict === undefined) {
      remaining.push({ ...action, state: 'failed' as const });

      continue;
    }

    if (verdict.status === 'applied') {
      sent += 1;

      continue;
    }

    refused += 1;
    remaining.push({ ...action, state: 'failed' as const, reason: verdict.reason });
  }

  publish(remaining);

  return { sent, refused, unsendable, signedOut: false };
}

/** A new person inherits nobody else's list. Called beside the sign-out. */
export function clearQueue(): void {
  publish([]);
}

const snapshot = (): readonly QueuedAction[] => load();

/** Stable across renders on the server, where there is no store to read. */
const EMPTY: readonly QueuedAction[] = [];
const serverSnapshot = (): readonly QueuedAction[] => EMPTY;

/** The queue, live. Re-renders whichever screens are showing it. */
export const useQueue = (): readonly QueuedAction[] =>
  useSyncExternalStore(subscribe, snapshot, serverSnapshot);

/** How many are still unsent — the count the More row carries. */
export const useQueueDepth = (): number => useQueue().length;
