/**
 * The till's own memory of what it did while the network was gone.
 *
 * `localStorage` and not React state, because the failure this exists for takes
 * the page with it: a tablet that loses Wi-Fi in a restaurant is a tablet
 * somebody also drops, locks, or reloads. A queue held in a component is a
 * shift's takings lost to a refresh, which is the exact failure the feature was
 * built to end.
 *
 * ---------------------------------------------------------------------------
 * The client's uuid is both halves of the contract
 *
 * `local_id` is the idempotency key AND the queue's own row id. The server's
 * `IdempotencyGuard` keys on it per terminal, so a batch sent twice — because
 * the connection dropped after the write and before the answer — replays rather
 * than charging a table twice. Generating a fresh one on retry would defeat
 * every guard on the far side, so ids are minted once, when the operation
 * happens, and never again.
 *
 * `local_seq` is the order the cashier actually worked in. It matters because
 * nothing else can reconstruct it: a bill must open before a line lands on it
 * and a payment must follow both, and the server sorts by this rather than by
 * arrival. A device that renumbered on retry would replay a shift out of order.
 *
 * ---------------------------------------------------------------------------
 * What this is NOT
 *
 * It is not offline selling. A till with no network still cannot open a bill it
 * can render, because the bill id comes from the server — `P12` in
 * `docs/PLAN-POS-FIRST.md` calls for a local store of menu, prices, tables and
 * stop list, and that is a separate piece. What this does is keep the writes a
 * loaded till makes when the router dies mid-shift, and hand them back in order
 * when it returns. Nothing is lost; nothing is doubled.
 */

/** The six ways the server can say the world moved. Mirrors `ConflictKind`. */
export type ConflictKind =
  | 'bill_settled'
  | 'payment_duplicate'
  | 'item_unavailable'
  | 'price_moved'
  | 'table_taken'
  | 'shift_closed';

/** What the server sent back with a 409, kept so the screen can ask the question. */
export type QueuedConflict = {
  kind: ConflictKind;
  /** Ordered — the first is the one the screen defaults to. */
  options: readonly string[];
  /** Whatever the conflict carried: the bill, the dish, the open bills, the shift. */
  context: Record<string, unknown>;
  /** The API's own sentence, in the reader's language. */
  detail: string;
};

export type QueuedEntry = {
  local_id: string;
  local_seq: number;
  /** One of `SyncDispatcher::ACTIONS`. */
  action: string;
  payload: Record<string, unknown>;
  /** ISO 8601, for the drawer's "queued at 21:14". */
  queued_at: string;
  /** Present once the server has answered this entry with a question. */
  conflict?: QueuedConflict;
};

/**
 * Scoped to the terminal, not to the browser.
 *
 * A tablet re-paired to a different till must not inherit the old one's queue:
 * those writes belong to a terminal the server knows by another id, and
 * replaying them under the new one would attribute a night's sales to the wrong
 * drawer. Re-pairing is rare and this is one line, which is the right trade.
 */
function keyFor(terminalCode: string): string {
  return `restaurant-campus-pos-queue:${terminalCode}`;
}

function read(terminalCode: string): QueuedEntry[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(keyFor(terminalCode));

    if (raw === null) return [];

    const parsed: unknown = JSON.parse(raw);

    return Array.isArray(parsed) ? (parsed as QueuedEntry[]) : [];
  } catch {
    /*
     * A corrupt queue reads as an empty one rather than throwing.
     *
     * Throwing here would take down the order screen on mount — a till that
     * cannot sell because of a bad string in local storage. The cost of the
     * other choice is that a genuinely corrupt queue is silently lost, which is
     * why it is written back only in whole and only after `JSON.stringify`
     * succeeds.
     */
    return [];
  }
}

function write(terminalCode: string, entries: readonly QueuedEntry[]): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(keyFor(terminalCode), JSON.stringify(entries));
  } catch {
    // Quota, or a private window that refuses. Nothing useful to do at the call
    // site — the write already happened or already failed — and throwing would
    // turn a full disk into a till that cannot take an order.
  }

  cached.delete(terminalCode);
  listeners.forEach((notify) => notify());
}

/* ============================================================
   Subscribing to it, the way React wants to be told

   `useSyncExternalStore` and not `useState` + an effect. The queue is exactly
   what that API is for — a store outside React that changes for reasons React
   cannot see — and the effect version had two faults the compiler is right to
   flag: it sets state synchronously on mount, and it reads `localStorage` in a
   place that has to agree with a server render which has no `localStorage` at
   all.

   The snapshot must be referentially stable or the hook re-renders forever, so
   the parsed array is cached per terminal and the cache is dropped on every
   write. That is the whole reason `write()` above ends the way it does.
   ============================================================ */

const cached = new Map<string, QueuedEntry[]>();
const listeners = new Set<() => void>();

/** Nothing is queued on the server, and there is no storage to ask. */
const NOTHING: QueuedEntry[] = [];

export function subscribe(notify: () => void): () => void {
  listeners.add(notify);

  // Another tab — a second till app on the same tablet — draining the same
  // queue. Rare, and cheap to be right about.
  const onStorage = () => {
    cached.clear();
    notify();
  };

  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(notify);

    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

/** The queue, oldest first, as one stable array until something changes it. */
export function snapshot(terminalCode: string): QueuedEntry[] {
  const held = cached.get(terminalCode);

  if (held !== undefined) return held;

  const fresh = read(terminalCode).sort((a, b) => a.local_seq - b.local_seq);

  cached.set(terminalCode, fresh);

  return fresh;
}

/**
 * What the server renders: nothing.
 *
 * The same array every time, because returning a fresh `[]` makes React decide
 * the store changed on every render and loop. It is also the truth — a server
 * has no local storage, so it cannot know a till's queue.
 */
export function serverSnapshot(): QueuedEntry[] {
  return NOTHING;
}

/** Everything still owed to the server, oldest first. */
export function queued(terminalCode: string): QueuedEntry[] {
  return snapshot(terminalCode);
}

/** The ones the server has asked a question about. */
export function conflicted(terminalCode: string): QueuedEntry[] {
  return queued(terminalCode).filter((entry) => entry.conflict !== undefined);
}

/**
 * Add a write to the queue.
 *
 * Called when a request fails to reach the server, never speculatively. An entry
 * queued alongside a successful write would be applied twice — once now and once
 * on the next drain — and the idempotency key would not save it, because the
 * successful write went up under a different key.
 */
export function enqueue(
  terminalCode: string,
  action: string,
  payload: Record<string, unknown>,
  /**
   * The id the failed attempt already carried, when there was one.
   *
   * This is the whole point of the mechanism and it was being thrown away: an
   * action that reached the network under one id and is replayed under another
   * is a *second* action to the server. Passing it in means a send that timed
   * out and a send that is replayed an hour later are the same docket, so the
   * kitchen cooks once.
   *
   * A fresh id when the caller has none — an action that never touched the
   * network cannot collide with anything.
   */
  localId?: string,
): QueuedEntry {
  const entries = read(terminalCode);

  const entry: QueuedEntry = {
    local_id: localId ?? crypto.randomUUID(),
    // One past the highest, not `length`: an entry removed from the middle would
    // otherwise hand its number to the next one and reorder the shift.
    local_seq: entries.reduce((top, held) => Math.max(top, held.local_seq), 0) + 1,
    action,
    payload,
    queued_at: new Date().toISOString(),
  };

  write(terminalCode, [...entries, entry]);

  return entry;
}

/** Take entries off the queue — applied, duplicated, or answered. */
export function settle(terminalCode: string, localIds: readonly string[]): QueuedEntry[] {
  const gone = new Set(localIds);
  const left = read(terminalCode).filter((entry) => !gone.has(entry.local_id));

  write(terminalCode, left);

  return left;
}

/** Record the question the server asked about an entry, so a person can answer it. */
export function markConflict(
  terminalCode: string,
  localId: string,
  conflict: QueuedConflict,
): QueuedEntry[] {
  const entries = read(terminalCode).map((entry) =>
    entry.local_id === localId ? { ...entry, conflict } : entry,
  );

  write(terminalCode, entries);

  return entries;
}

/**
 * Everything queued behind a bill that has just been given a real id.
 *
 * A till with no network cannot know what number a bill will get, so the lines
 * behind it point at the local id of the entry that opened it. When the server
 * answers — or when a person merges the bill into one that already exists — that
 * pointer becomes a number, and every entry still holding the old one has to be
 * rewritten or it will be dispatched against a bill that does not exist.
 */
export function resolvePointers(
  terminalCode: string,
  openedByLocalId: string,
  billId: number,
): QueuedEntry[] {
  const entries = read(terminalCode).map((entry) =>
    entry.payload.bill_local_id === openedByLocalId
      ? {
          ...entry,
          payload: { ...entry.payload, bill_id: billId, bill_local_id: undefined },
        }
      : entry,
  );

  write(terminalCode, entries);

  return entries;
}

/** Wipe it. Only ever from a deliberate act — re-pairing, or a manager's reset. */
export function clear(terminalCode: string): void {
  if (typeof window === 'undefined') return;

  window.localStorage.removeItem(keyFor(terminalCode));
  cached.delete(terminalCode);
  listeners.forEach((notify) => notify());
}
