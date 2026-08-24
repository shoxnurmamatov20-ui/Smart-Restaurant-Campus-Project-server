import { useSyncExternalStore } from 'react';

/**
 * What a table has chosen and not yet told anybody.
 *
 * The web build keeps this in `localStorage` keyed by `slug:table`
 * (`apps/web/src/lib/guest-cart.ts`). The key is the same here and for the same
 * reason: a basket belongs to the **table**, not to the phone that scanned —
 * two people at table 14 with two phones are ordering one order.
 *
 * **It is not persisted, and that is a decision rather than an omission.** The
 * only store this app has is `SecureStore`, which is the Keychain: it is for
 * credentials, it is size-limited, and a list of three dishes is neither a
 * secret nor small. `AsyncStorage` would be the right shape and is a dependency
 * this app does not carry. So the basket lives as long as the app does, which
 * is the length of one meal — and what it holds is deliberately small, because
 * the moment it is sent it is gone: `POST /api/v1/public/tables/{table}/order`
 * takes it, the status screen presses it, and `clearBasket()` follows a
 * SUCCESSFUL send.
 *
 * Prices are integer tiyin and every one of them came from the API. Nothing
 * here multiplies a price by anything except a whole quantity.
 */
export type BasketLine = {
  /**
   * The dish plus what was chosen with it, so two spellings of one dish are two
   * lines. A tea with "no sugar" and a tea without are not the same row.
   */
  key: string;
  dishId: string;
  name: string;
  /** Tiyin, per unit, add-ons already inside. */
  unitPrice: number;
  quantity: number;
  /** Add-on names, already in the reader's language. Printed under the line. */
  options: readonly string[];
  /**
   * The catalogue's own choice ids, when the kitchen asked the question.
   *
   * These are what `POST /public/tables/{table}/order` prices through
   * `MenuCatalog`, so they are the only add-ons that can reach a bill. Empty
   * when the dish carries no `modifier_groups` and the sheet fell back to
   * `DISH_ADDONS` — whose keys are words the endpoint refuses. See the note on
   * that constant for what happens to those instead.
   */
  choiceIds: readonly string[];
  /** What the guest asked the kitchen for. */
  note: string;
};

export type Basket = {
  /** `slug:table`. */
  id: string;
  lines: readonly BasketLine[];
};

/*
 * One object per basket, replaced rather than mutated.
 *
 * `useSyncExternalStore` compares snapshots by identity and re-renders whenever
 * they differ, so a `getSnapshot` that built a fresh object each call would
 * loop forever. Every read returns the stored object; every write puts a new
 * one in its place.
 */
const baskets = new Map<string, Basket>();
const listeners = new Set<() => void>();

function snapshot(id: string): Basket {
  const held = baskets.get(id);

  if (held !== undefined) return held;

  const fresh: Basket = { id, lines: [] };
  baskets.set(id, fresh);

  return fresh;
}

function commit(next: Basket) {
  baskets.set(next.id, next);

  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/**
 * A stable line key from a dish and what was chosen with it.
 *
 * The choice ids lead where there are any, because two groups on one dish may
 * legitimately answer to the same word — a "Katta" size and a "Katta" portion
 * of salad — and keying on the names would merge two lines the kitchen must
 * cook differently. The names are still in the key for the fallback add-ons,
 * which have no ids at all.
 */
export function lineKey(
  dishId: string,
  options: readonly string[],
  note: string,
  choiceIds: readonly string[] = [],
): string {
  return [dishId, [...choiceIds].sort().join('|'), [...options].sort().join('|'), note.trim()].join(
    '::',
  );
}

export function useBasket(id: string): Basket {
  return useSyncExternalStore(subscribe, () => snapshot(id));
}

export function addLine(id: string, line: Omit<BasketLine, 'key'>) {
  const current = snapshot(id);
  const key = lineKey(line.dishId, line.options, line.note, line.choiceIds);
  const held = current.lines.find((entry) => entry.key === key);

  commit({
    id,
    lines: held
      ? current.lines.map((entry) =>
          entry.key === key ? { ...entry, quantity: entry.quantity + line.quantity } : entry,
        )
      : [...current.lines, { ...line, key }],
  });
}

/** Zero or less removes the line — a stepper pressed down to nothing is a delete. */
export function setQuantity(id: string, key: string, quantity: number) {
  const current = snapshot(id);

  commit({
    id,
    lines:
      quantity <= 0
        ? current.lines.filter((entry) => entry.key !== key)
        : current.lines.map((entry) => (entry.key === key ? { ...entry, quantity } : entry)),
  });
}

/**
 * Empty it.
 *
 * One caller, and it is the one that matters: the basket has just been sent to
 * the kitchen, so the lines have moved from "chosen" to "somebody is cooking
 * them" and keeping them here would offer to send the same food twice. Called
 * only on a SUCCESSFUL send — a failed one that cleared would leave a guest
 * with no list, no food and nothing to retry.
 */
export function clearBasket(id: string) {
  commit({ id, lines: [] });
}

/** How many plates, which is what the guest counts — not how many rows. */
export const basketCount = (basket: Basket): number =>
  basket.lines.reduce((sum, line) => sum + line.quantity, 0);

/** What the lines come to, before service, discount or tax. Tiyin. */
export const basketSubtotal = (basket: Basket): number =>
  basket.lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

/** How many of one dish are in the basket, across however many lines it is on. */
export const countOf = (basket: Basket, dishId: string): number =>
  basket.lines
    .filter((line) => line.dishId === dishId)
    .reduce((sum, line) => sum + line.quantity, 0);
