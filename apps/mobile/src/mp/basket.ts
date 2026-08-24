import { useMemo, useSyncExternalStore } from 'react';
import { MP_PROMO, PAY_RAILS, type PayRail } from '@restaurant/surfaces/mp/data';

import type { Lang } from '@/lib/locale';

import {
  placeOrder,
  type Answer,
  type LiveDish,
  type LiveOrder,
  type LiveStore,
  type MpAddress,
  type PlacedLine,
} from './live';

/**
 * The marketplace basket, and the four other things a MyPOS session remembers.
 *
 * A module-level store rather than a provider, for the same reasons
 * `lib/cart.ts` gives for the customer app: the tab navigator can re-create its
 * subtree, the address sheet is a `Modal` and therefore its own React root on
 * Android, and five screens across five tabs have to agree on one basket. A
 * module has no tree to be inside of.
 *
 * **Separate from `lib/cart.ts` on purpose.** That basket holds
 * `@restaurant/surfaces/customer` dishes with portions, modifiers and a kitchen
 * note; this one holds marketplace dishes, which have none of those, and belongs
 * to a *store* rather than to a restaurant the guest is already inside. Merging
 * them would mean one of the two carrying fields it can never fill, and the
 * first screen to read an empty `portionId` would price a delivery at zero.
 *
 * **Money is never computed here.** A line knows its dish and how many; what the
 * order comes to is `@restaurant/surfaces/money`, the mirror of
 * `App\Support\Orders\BillTotals`. Only `subtotal` is summed here, because a
 * subtotal is arithmetic on the basket rather than a rule about a bill. Every
 * figure is an integer in tiyin, start to finish.
 *
 * ---------------------------------------------------------------------------
 * Why the store and the dishes are held whole rather than by id
 *
 * This kept ids and resolved them against the fixture menu, which worked while
 * there was only one menu in the app. There is a server now: two guests can be
 * looking at two different catalogues, a dish can be 86'd between the tap and
 * the checkout, and a price can change under a basket that has been open for an
 * hour. A line therefore carries the dish it was added from — the name and the
 * price the guest actually saw — and the basket carries the store card it
 * belongs to, so the cart can draw its header without asking anybody.
 *
 * **Still not persisted.** A basket that outlived the process would quote
 * yesterday's prices with today's confidence. It lives as long as the app does;
 * what survives a restart is the order, on the server, under its number.
 */

/** One row: which dish, and how many of it. */
export type BasketLine = { dish: LiveDish; quantity: number };

type BasketState = {
  /**
   * Which store the basket belongs to.
   *
   * A marketplace basket cannot span two kitchens — two restaurants means two
   * couriers and two delivery fees, and the design's cart screen draws exactly
   * one store header. Adding from a second store therefore starts a new basket
   * rather than mixing, which is what the guest meant by opening a second store.
   */
  store: LiveStore | null;
  lines: readonly BasketLine[];
  address: MpAddress | null;
  rail: PayRail;
  /** Whether `MP_PROMO` is being previewed against this basket. */
  promo: boolean;
  /**
   * The idempotency token for this basket, minted when it is first started.
   *
   * `POST /mp/orders` is idempotent on `(consumer_id, client_reference)` rather
   * than on an `Idempotency-Key` header — that middleware claims its key against
   * a tenant and the consumer surface has none — so this is the only thing
   * standing between a dropped connection and two dinners. Minted once per
   * basket, sent on every attempt, and cleared the moment the server owns the
   * order.
   */
  reference: string | null;
  /** The number of the last order this device placed, for the tracking screen. */
  lastOrderNumber: string | null;
};

const FALLBACK_RAIL: PayRail = PAY_RAILS[0] ?? 'click';

/**
 * A basket reference. Unique, not unguessable.
 *
 * The same shape and the same reasoning as `lib/api.ts`'s idempotency key:
 * Hermes has no `crypto` global unless a polyfill is installed, and this is a
 * de-duplication token rather than a secret — the counter is what makes two
 * baskets started in the same millisecond distinct. Sixty-four characters is the
 * server's ceiling and `[A-Za-z0-9._:-]` is its alphabet.
 */
let baskets = 0;

function reference(): string {
  baskets += 1;

  return `mp-${Date.now().toString(36)}-${baskets.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let state: BasketState = {
  store: null,
  lines: [],
  address: null,
  rail: FALLBACK_RAIL,
  promo: false,
  reference: null,
  lastOrderNumber: null,
};

const listeners = new Set<() => void>();

/**
 * Every mutation replaces the whole object and nothing is edited in place — a
 * store that mutates its own snapshot is a store whose subscribers never
 * re-render, which is the single way `useSyncExternalStore` fails.
 */
function commit(next: BasketState): void {
  state = next;

  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

const snapshot = (): BasketState => state;

export const basket = {
  /**
   * Add one of a dish, from a named store.
   *
   * Adding from a different store empties the basket first. The alternative —
   * silently keeping both — produces an order one courier cannot collect, and
   * the guest finds out at the door.
   */
  add(store: LiveStore, dish: LiveDish): void {
    const fresh = state.store !== null && state.store.id !== store.id;
    const lines = fresh ? [] : state.lines;
    const existing = lines.find((line) => line.dish.id === dish.id);

    commit({
      ...state,
      store,
      promo: fresh ? false : state.promo,
      // A new basket is a new order, so it gets a new reference. Reusing the
      // last one would make the server answer with the *previous* order.
      reference: lines.length === 0 || fresh ? reference() : state.reference,
      lines:
        existing === undefined
          ? [...lines, { dish, quantity: 1 }]
          : lines.map((line) =>
              line.dish.id === dish.id ? { ...line, quantity: line.quantity + 1 } : line,
            ),
    });
  },

  /** Below one removes the row, so no caller has to filter the list itself. */
  setQuantity(dishId: string, quantity: number): void {
    const lines =
      quantity < 1
        ? state.lines.filter((line) => line.dish.id !== dishId)
        : state.lines.map((line) => (line.dish.id === dishId ? { ...line, quantity } : line));

    commit({
      ...state,
      lines,
      // An empty basket belongs to nobody, and a promo goes with the basket it
      // was applied to rather than following the guest into the next one.
      store: lines.length === 0 ? null : state.store,
      promo: lines.length === 0 ? false : state.promo,
      reference: lines.length === 0 ? null : state.reference,
    });
  },

  setAddress(address: MpAddress): void {
    commit({ ...state, address });
  },

  /**
   * The address book's own default, taken only when the guest has chosen
   * nothing yet — a screen that adopted it on every load would undo a choice
   * made on the previous screen.
   */
  suggestAddress(address: MpAddress): void {
    if (state.address !== null) return;

    commit({ ...state, address });
  },

  setRail(rail: PayRail): void {
    commit({ ...state, rail });
  },

  /**
   * Previews `MP_PROMO` against this basket.
   *
   * **Local, and only a preview.** The code is sent with the order and the
   * server is what decides: whether the campaign is live, whose it is, whether
   * this guest has already spent it, and what it is actually worth on this
   * basket. `POST /mp/orders` answers with `discount_tiyin` computed there, and
   * the tracking screen prints that figure rather than this one.
   *
   * The preview is kept because a cart with no discount line and a code the
   * guest has typed reads as a code that did not work. If the server disagrees,
   * the total on the placed order is the total — which is exactly why the cart
   * refreshes from the answer instead of trusting the arithmetic it drew.
   */
  togglePromo(): boolean {
    const next = !state.promo;

    commit({ ...state, promo: next });

    return next;
  },

  /**
   * Sends the basket, and remembers the number that came back.
   *
   * The basket is cleared only on an accepted order. A refusal — the shop just
   * closed, a dish went out, the basket is under the kitchen's minimum — leaves
   * everything where it was, including the reference, so pressing the button
   * again is the *same* attempt rather than a second one.
   */
  async place(lang: Lang, promoCode?: string): Promise<Answer<{ data: LiveOrder }>> {
    const { store, lines, address } = state;

    if (store === null || lines.length === 0) {
      return { ok: false, code: 'marketplace.basket_empty', message: null };
    }

    if (address === null) {
      return { ok: false, code: 'marketplace.address_required', message: null };
    }

    const rows: PlacedLine[] = [];

    for (const line of lines) {
      /*
       * A sample dish has no menu item behind it, so a basket built from the
       * fixture menu cannot be sent. Refused here rather than posting nulls the
       * validator would reject with a field error nobody can act on.
       */
      if (line.dish.menuItemId === null) {
        return { ok: false, code: 'marketplace.sample_basket', message: null };
      }

      rows.push({ menu_item_id: line.dish.menuItemId, quantity: line.quantity });
    }

    const sent = await placeOrder(
      {
        store: store.id,
        lines: rows,
        address: address.address,
        ...(address.note === null ? {} : { address_note: address.note }),
        ...(address.latitude === null ? {} : { latitude: address.latitude }),
        ...(address.longitude === null ? {} : { longitude: address.longitude }),
        pay_rail: state.rail,
        ...(promoCode === undefined ? {} : { promo_code: promoCode }),
        ...(state.reference === null ? {} : { client_reference: state.reference }),
      },
      lang,
    );

    if (!sent.ok) return sent;

    commit({
      ...state,
      lines: [],
      store: null,
      promo: false,
      // The server owns the order now. Holding the reference would make the next
      // basket resolve to this order instead of placing its own.
      reference: null,
      lastOrderNumber: sent.data.number,
    });

    return sent;
  },
};

/** A line with its arithmetic done, for anything that draws one. */
export type ResolvedLine = { dish: LiveDish; quantity: number; linePrice: number };

export type BasketView = {
  /** Resolved when the basket has one, `null` when it is empty. */
  store: LiveStore | null;
  lines: readonly ResolvedLine[];
  /** Plates, not rows — the dock badge counts plates. */
  count: number;
  /** Tiyin, before discount, service or delivery. */
  subtotal: number;
  address: MpAddress | null;
  rail: PayRail;
  /** Tiyin the promo preview takes off, zero when it is not applied. */
  discount: number;
  promo: boolean;
  /** The code to send with the order, when one is being previewed. */
  promoCode: string | undefined;
  lastOrderNumber: string | null;
};

/**
 * The basket, from any screen.
 *
 * The derived half is memoised on the snapshot's identity, so a screen that only
 * reads `count` re-renders once per change rather than once per keystroke
 * somewhere else.
 */
export function useBasket(): BasketView {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);

  return useMemo<BasketView>(() => {
    const lines = current.lines.map((line) => ({
      dish: line.dish,
      quantity: line.quantity,
      linePrice: line.dish.price * line.quantity,
    }));

    return {
      store: current.store,
      lines,
      count: lines.reduce((sum, line) => sum + line.quantity, 0),
      subtotal: lines.reduce((sum, line) => sum + line.linePrice, 0),
      address: current.address,
      rail: current.rail,
      discount: current.promo ? MP_PROMO.discount : 0,
      promo: current.promo,
      promoCode: current.promo ? MP_PROMO.code : undefined,
      lastOrderNumber: current.lastOrderNumber,
    };
  }, [current]);
}
