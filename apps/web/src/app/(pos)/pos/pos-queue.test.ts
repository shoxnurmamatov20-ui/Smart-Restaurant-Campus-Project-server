import { beforeEach, describe, expect, it } from 'vitest';

import {
  clear,
  enqueue,
  markConflict,
  queued,
  resolvePointers,
  serverSnapshot,
  settle,
  snapshot,
  subscribe,
} from './pos-queue';

/**
 * The queue holds a shift's takings when the router dies.
 *
 * Every test here is one sentence: **nothing is lost and nothing is doubled.**
 * That promise is the whole of P12, and the failures it guards against are not
 * abstract — a line dropped is food that leaves the kitchen unpaid for, an id
 * regenerated on retry is a table charged twice for a meal they ate once.
 */
const TILL = 'KASSA-1';

beforeEach(() => {
  clear(TILL);
  window.localStorage.clear();
});

describe('what is owed', () => {
  it('keeps a write the network never carried', () => {
    enqueue(TILL, 'bill.line.add', { bill_id: 4, menu_item_id: 7 });

    expect(queued(TILL)).toHaveLength(1);
    expect(queued(TILL)[0]?.action).toBe('bill.line.add');
  });

  it('survives the page being thrown away', () => {
    enqueue(TILL, 'bill.line.add', { bill_id: 4, menu_item_id: 7 });

    /*
     * The failure this exists for takes the page with it: a tablet that loses
     * Wi-Fi is a tablet somebody also drops, locks or reloads. Reading it back
     * from storage with a cold module cache is that reload.
     */
    const raw = window.localStorage.getItem(`restaurant-campus-pos-queue:${TILL}`);

    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? '[]')).toHaveLength(1);
  });

  it('gives each entry an id nobody else will reuse', () => {
    const first = enqueue(TILL, 'bill.line.add', {});
    const second = enqueue(TILL, 'bill.line.add', {});

    // The id is the idempotency key. Two entries sharing one means the server
    // answers the second with the first one's result — a second round of drinks
    // silently becoming a duplicate of the first.
    expect(first.local_id).not.toBe(second.local_id);
  });

  it('numbers entries in the order the cashier worked', () => {
    const first = enqueue(TILL, 'bill.open', {});
    const second = enqueue(TILL, 'bill.line.add', {});
    const third = enqueue(TILL, 'bill.tender', {});

    expect([first.local_seq, second.local_seq, third.local_seq]).toEqual([1, 2, 3]);
  });

  it('never hands a sequence number to two entries', () => {
    enqueue(TILL, 'bill.open', {});
    const second = enqueue(TILL, 'bill.line.add', {});
    enqueue(TILL, 'bill.tender', {});

    // Resolve the middle one, then queue another. Numbering from `length` would
    // give the new entry the number the removed one had, and the server sorts by
    // it — replaying a bill after the payment for it.
    settle(TILL, [second.local_id]);

    const fourth = enqueue(TILL, 'bill.discount', {});

    expect(fourth.local_seq).toBe(4);
    expect(new Set(queued(TILL).map((entry) => entry.local_seq)).size).toBe(3);
  });

  it('reads back oldest first whatever order it was written in', () => {
    const a = enqueue(TILL, 'bill.open', {});
    const b = enqueue(TILL, 'bill.line.add', {});

    expect(queued(TILL).map((entry) => entry.local_id)).toEqual([a.local_id, b.local_id]);
  });
});

describe('answering', () => {
  it('remembers the question the server asked', () => {
    const entry = enqueue(TILL, 'bill.line.add', { bill_id: 4 });

    markConflict(TILL, entry.local_id, {
      kind: 'item_unavailable',
      options: ['keep', 'substitute', 'void_line'],
      context: { menu_item_id: 7 },
      detail: 'Manti hozir stop-listda.',
    });

    const held = queued(TILL)[0];

    expect(held?.conflict?.kind).toBe('item_unavailable');
    // The order is the server's and the screen defaults to the first. `keep`
    // before `void_line` is deliberate and must not be re-sorted on the way in.
    expect(held?.conflict?.options).toEqual(['keep', 'substitute', 'void_line']);
  });

  it('takes an answered entry off the queue and leaves the rest', () => {
    const first = enqueue(TILL, 'bill.open', {});
    enqueue(TILL, 'bill.line.add', {});

    settle(TILL, [first.local_id]);

    expect(queued(TILL)).toHaveLength(1);
    expect(queued(TILL)[0]?.action).toBe('bill.line.add');
  });
});

describe('the bill a queued line points at', () => {
  it('turns the entry it was opened by into a real bill id', () => {
    const opening = enqueue(TILL, 'bill.open', { table_id: 7 });
    enqueue(TILL, 'bill.line.add', { bill_local_id: opening.local_id, menu_item_id: 7 });
    enqueue(TILL, 'bill.line.add', { bill_local_id: opening.local_id, menu_item_id: 9 });

    /*
     * A till with no network cannot know what number a bill will get, so the
     * lines behind it point at the entry that opened it. Left unresolved, both
     * would be dispatched against a bill that does not exist and a table's whole
     * order would fail on replay.
     */
    resolvePointers(TILL, opening.local_id, 4812);

    const lines = queued(TILL).filter((entry) => entry.action === 'bill.line.add');

    expect(lines.map((entry) => entry.payload.bill_id)).toEqual([4812, 4812]);
    expect(lines.every((entry) => entry.payload.bill_local_id === undefined)).toBe(true);
  });

  it('leaves lines belonging to another bill alone', () => {
    const mine = enqueue(TILL, 'bill.open', {});
    const theirs = enqueue(TILL, 'bill.open', {});
    enqueue(TILL, 'bill.line.add', { bill_local_id: theirs.local_id });

    resolvePointers(TILL, mine.local_id, 4812);

    expect(queued(TILL)[2]?.payload.bill_id).toBeUndefined();
  });
});

describe('the queue as a store React can subscribe to', () => {
  it('hands out the same array until something changes', () => {
    enqueue(TILL, 'bill.open', {});

    // Referential stability is not an optimisation here: `useSyncExternalStore`
    // re-renders whenever the snapshot changes identity, so a fresh array every
    // call is an infinite loop.
    expect(snapshot(TILL)).toBe(snapshot(TILL));
  });

  it('hands out a different array once something does', () => {
    const before = snapshot(TILL);

    enqueue(TILL, 'bill.open', {});

    expect(snapshot(TILL)).not.toBe(before);
  });

  it('tells subscribers when the queue moves', () => {
    let told = 0;
    const stop = subscribe(() => {
      told += 1;
    });

    const entry = enqueue(TILL, 'bill.open', {});
    settle(TILL, [entry.local_id]);
    stop();
    enqueue(TILL, 'bill.line.add', {});

    // Two while subscribed, and none after unsubscribing — a panel that kept
    // being told after unmount is a React warning and a leak.
    expect(told).toBe(2);
  });

  it('says a server knows nothing, the same way every time', () => {
    // A fresh `[]` per call makes React decide the store changed on every render.
    expect(serverSnapshot()).toBe(serverSnapshot());
    expect(serverSnapshot()).toHaveLength(0);
  });
});

describe('a queue that cannot be read', () => {
  it('reads as empty rather than taking the till down', () => {
    window.localStorage.setItem(`restaurant-campus-pos-queue:${TILL}`, 'not json');

    // Throwing here would break the order screen on mount: a till that cannot
    // sell because of a bad string in local storage.
    expect(queued(TILL)).toEqual([]);
  });
});

/**
 * The action id, which is the mechanism and was being thrown away.
 *
 * `X-Pos-Local-Id` identifies an **action**, not an HTTP request. A send that
 * timed out and the same send replayed an hour later must carry one id, or the
 * server sees two dockets and the kitchen cooks twice — the exact failure the
 * offline queue exists to prevent.
 */
describe('the action id', () => {
  it('keeps the id the failed attempt already carried', () => {
    const attempted = 'attempt-0001';

    const entry = enqueue('T-1', 'bill.send', { bill_id: 7 }, attempted);

    expect(entry.local_id).toBe(attempted);
  });

  it('mints one only when the action never touched the network', () => {
    const entry = enqueue('T-2', 'bill.line.add', { bill_id: 7 });

    expect(entry.local_id).toMatch(/[0-9a-f-]{8,}/);
  });
});
