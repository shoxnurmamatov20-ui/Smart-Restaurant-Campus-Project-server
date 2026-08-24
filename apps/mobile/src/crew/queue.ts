import { useSyncExternalStore } from 'react';

import { post } from '@/lib/api';
import { KEYS } from '@/lib/storage';

import { enrolment } from './session';

/**
 * What this phone did that the server has not been told about.
 *
 * Flow F13 in the design. A waiter in a basement dining room keeps working
 * while the network is gone, and this is where the work waits — in order, with
 * the moment it happened, until `drain()` can hand it over.
 *
 * **In memory, and deliberately.** The only persistent store on this handset is
 * the Keychain (`lib/storage.ts`), which is for credentials — writing a queue of
 * business actions into it would put a growing list of table numbers and
 * amounts in the place reserved for secrets, and `SecureStore` has a value-size
 * ceiling that a day of service would reach. What that costs is a queue that
 * does not survive the app being killed, which is a real gap and a smaller one
 * than the alternative.
 *
 * **Order is kept, first in first out.** `QUEUE_COPY.order` says why in the
 * words the screen shows: sent out of order, the kitchen sees a dish after it
 * was cancelled. `drain()` sends the batch in that order and the server applies
 * it in that order.
 *
 * **An entry is sent at most once, however many times it is retried.** Each
 * carries `id`, which travels as `local_id` and never changes — the server
 * keys on it, so a batch resent after a dropped connection writes nothing
 * twice. That is the whole reason the id is generated here rather than there.
 */

export type QueueState = 'waiting' | 'sending' | 'failed';

/**
 * What the server can be told about, and what it does with each.
 *
 * Four of the eight land somewhere real today — two in attendance, two in the
 * store — and four are journalled against the person until the module that owns
 * them can take them. Either way nothing is dropped; see
 * `StaffActionController`.
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
  /*
   * The two whose whole product is the journal row — a courier's cash
   * declaration and a checklist tick. Queued like the rest because the phone
   * that ticks off a closing list at half past midnight is the phone least
   * likely to have signal, and because a tick the server never hears vanishes
   * with the next lock screen. See `StaffAction::JOURNAL_ONLY_KINDS`.
   */
  | 'cash_handover'
  | 'checklist_tick';

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
   * Optional because not every button on this app has one yet: a screen still
   * drawing fixture rows has no ingredient id to put in a payload, and an entry
   * with an invented one would be worse than an entry that waits. Those stay in
   * the list, visible, and `drain()` reports them as unsendable rather than
   * quietly discarding them.
   */
  kind?: ActionKind;
  payload?: Record<string, unknown>;
  /** Why the last attempt did not land, as the server's code. */
  reason?: string;
};

/** What one drain did, for the screen that asked for it. */
export type DrainResult = {
  sent: number;
  refused: number;
  /** Entries with no verb to send — see `kind`. */
  unsendable: number;
};

type ActionAnswer = {
  data?: {
    results?: readonly { local_id?: string; status?: string; reason?: string }[];
  };
};

let actions: readonly QueuedAction[] = [];
let serial = 0;

const listeners = new Set<() => void>();

function publish(next: readonly QueuedAction[]): void {
  actions = next;

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
 * screen says "this is worth showing the person, and there is nothing to post
 * yet".
 */
export function enqueue(
  label: string,
  detail: string,
  entry?: { kind: ActionKind; payload?: Record<string, unknown> },
): void {
  serial += 1;

  publish([
    ...actions,
    {
      /*
       * Unique across restarts as well as within one run.
       *
       * A bare counter would restart at `q1` after the app was killed, and the
       * server keys on this string per person — so the first entry of the new
       * session would collide with the first of the old one and be answered as
       * a duplicate that never happened. The timestamp is what stops that.
       */
      id: `q${Date.now().toString(36)}-${serial}`,
      label,
      detail,
      at: Date.now(),
      state: 'waiting' as const,
      kind: entry?.kind,
      payload: entry?.payload,
    },
  ]);
}

/** The staff session's bearer and the tenant this phone was paired to. */
async function scope() {
  const phone = await enrolment();

  return { bearer: KEYS.crewSession, tenant: phone?.tenant ?? null } as const;
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
 * the entries stay, and the next tap tries again with the same ids — which is
 * exactly the case the ids exist for.
 */
export async function drain(): Promise<DrainResult> {
  const sendable = actions.filter((action) => action.kind !== undefined);
  const unsendable = actions.length - sendable.length;

  if (sendable.length === 0) {
    // Nothing to post. The entries that are left are shown as failed, which is
    // the truth about them: there is no verb to send them under yet.
    publish(actions.map((action) => ({ ...action, state: 'failed' as const })));

    return { sent: 0, refused: 0, unsendable };
  }

  publish(
    actions.map((action) =>
      action.kind === undefined ? action : { ...action, state: 'sending' as const },
    ),
  );

  let answer: ActionAnswer;

  try {
    answer = await post<ActionAnswer>(
      '/staff/actions',
      {
        entries: sendable.map((action) => ({
          local_id: action.id,
          kind: action.kind,
          // When it happened, not when it was sent. The server stamps the
          // trading day from this, so a night's work drained the next morning
          // still belongs to the night.
          at: new Date(action.at).toISOString(),
          payload: action.payload ?? {},
        })),
      },
      await scope(),
    );
  } catch {
    publish(actions.map((action) => ({ ...action, state: 'failed' as const })));

    return { sent: 0, refused: 0, unsendable };
  }

  const verdicts = new Map(
    (answer.data?.results ?? []).map((result) => [result.local_id ?? '', result]),
  );

  let sent = 0;
  let refused = 0;

  const remaining: QueuedAction[] = [];

  for (const action of actions) {
    const verdict = verdicts.get(action.id);

    /*
     * No verdict means the server never saw it — an entry with no verb, or one
     * the answer somehow left out. It stays, which is the safe direction: a
     * queue that keeps something twice is a nuisance, one that drops something
     * once is a write-off nobody can account for.
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

  return { sent, refused, unsendable };
}

/** For tests and for a sign-out: a new person inherits nobody else's list. */
export function clearQueue(): void {
  publish([]);
}

const snapshot = (): readonly QueuedAction[] => actions;

/** The queue, live. Re-renders whichever screens are showing it. */
export const useQueue = (): readonly QueuedAction[] =>
  useSyncExternalStore(subscribe, snapshot, snapshot);

/** How many are still unsent — the count the More row carries. */
export const useQueueDepth = (): number => useQueue().length;
