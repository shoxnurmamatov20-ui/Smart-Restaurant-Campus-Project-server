'use client';

import { useSyncExternalStore } from 'react';

/**
 * Which ingredients have been ordered on this screen, since the page loaded.
 *
 * A two-line store rather than `useState`, because two components need the same
 * answer and neither owns the other: the Order button lives inside the stock
 * table (a client island) and the open-purchases figure lives in the KPI strip
 * above the tab bar (rendered on the server). The design binds them —
 * `ivPoCount: 8 + (S.ivPo || []).length` — so pressing Order raises the count,
 * and the count is one of the four figures a storekeeper reads first.
 *
 * Deliberately *not* persisted and deliberately not in the URL. It is optimism,
 * not state: the button now posts a real draft order
 * (`POST /api/v1/suppliers/purchase-orders`) and the figure above comes back
 * from the server counting exactly those — but this page is a server component
 * and does not re-render on a click, so without this the count would sit
 * unchanged until the storekeeper reloaded and would read as a button that did
 * nothing.
 *
 * It goes away when the strip can subscribe to the answer rather than to the
 * press.
 */

let ordered: readonly string[] = [];
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

export function markOrdered(id: string): void {
  if (ordered.includes(id)) return;

  ordered = [...ordered, id];
  emit();
}

export const hasOrdered = (id: string): boolean => ordered.includes(id);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => ordered;

/*
 * The server snapshot is the same frozen empty array every time — a new `[]`
 * here would make React think the store changed on every server render and warn
 * about it.
 */
const EMPTY: readonly string[] = [];
const serverSnapshot = () => EMPTY;

export const useOrdered = (): readonly string[] =>
  useSyncExternalStore(subscribe, snapshot, serverSnapshot);
