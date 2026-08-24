'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import {
  BRANCH_BY_ID,
  DISH_BY_ID,
  MODIFIER_BY_ID,
  PORTION_BY_ID,
  PROMO_CODES,
  PROMO_MINIMUM,
  type Branch,
  type Dish,
  type Lang,
  type Modifier,
  type Portion,
} from '@restaurant/surfaces/customer/data';
import {
  DEMO_MENU,
  DEMO_VENUES,
  type CustomerMenu,
  type CustomerVenues,
} from '@restaurant/surfaces/customer/live';
import { percentOf } from '@restaurant/surfaces/money';

import { checkPromo } from './customer-client';

/**
 * The basket, held in the browser for as long as it has to be.
 *
 * In React state rather than on the server, and that is now a decision rather
 * than a limitation: a basket is a draft, and a draft that survives a lost
 * connection belongs on the device holding it. It becomes an order in one call,
 * at the checkout — `POST /api/v1/public/orders`, priced entirely by the server.
 *
 * ---------------------------------------------------------------------------
 * The catalogue is a parameter, and that is the whole seam
 *
 * A line stores an id, not a dish. Which catalogue that id belongs to decides
 * whether the basket can be ordered at all: the fixtures key dishes by word
 * (`'osh'`), a live menu keys them by the kitchen's own row id (`'412'`), and
 * `POST /api/v1/public/orders` accepts only the second. So the provider is
 * handed the menu the screens are drawing — fetched once in the layout, shared
 * by every screen — and `live` says which it got. A screen that cannot order
 * says so on the button instead of finding out at the last tap.
 *
 * **Money is never computed here.** A line knows its dish, its size and its
 * extras; what the whole thing costs is `pricing.ts`, which mirrors the server's
 * `BillTotals` exactly. Two places that both add up a bill is how a phone quotes
 * one number and a receipt prints another, in front of a guest.
 */
export type CartLine = {
  /**
   * The line's own id, not the dish's.
   *
   * Two lines of the same dish are ordinary — one with extra meat, one without —
   * and they have to be removable independently. Keying by dish id would make
   * the second tap edit the first line.
   */
  key: string;
  dishId: string;
  portionId: string;
  modifierIds: readonly string[];
  quantity: number;
  /** What the guest typed for the kitchen. Free text, in their own words. */
  note: string;
};

/**
 * How this order is served.
 *
 * Two of the API's four `orders.channel` values, and deliberately not all four:
 * a guest sitting at a table orders through the QR surface, where the table
 * number is in the URL. This app is opened from a sofa. Neither channel is
 * charged service — `pricing.ts` decides that, not this type — which is what the
 * menu screen's footnote already promises.
 */
export type CustomerChannel = 'delivery' | 'takeaway';

/**
 * A promo code that passed, kept with what it was worth when it did.
 *
 * `percent` for a percentage campaign — recomputed against the basket on every
 * render, so adding a drink after applying `OSH15` raises the discount the way
 * a guest expects. `fixedTiyin` for the other two kinds: a coupon worth a flat
 * amount, or a free delivery that is worth nothing off the food line and
 * everything off the delivery one. Exactly one of them is non-zero.
 */
export type AppliedPromo = {
  code: string;
  percent: number;
  fixedTiyin: number;
  freeDelivery: boolean;
};

/**
 * Why a code was refused, in the vocabulary the cart screen has copy for.
 *
 * Returned rather than thrown, and never rendered as a raw string: the screen
 * maps each case onto a sentence that says what to do about it. "empty" is a
 * real case — an apply button pressed over an empty field is a guest who typed
 * nothing and needs telling, not a no-op.
 */
export type PromoOutcome = 'ok' | 'empty' | 'already' | 'unknown' | 'floor';

/**
 * What a code took off this basket, in tiyin.
 *
 * A function rather than a stored number, because a percentage has to follow
 * the basket: a guest who applies 15% and then adds a lavash should see the
 * discount grow. A flat coupon does not, and is floored at the basket so the
 * bill can never go negative.
 */
export function promoDiscount(promo: AppliedPromo | null, subtotal: number): number {
  if (promo === null) return 0;

  return promo.percent > 0
    ? percentOf(subtotal, promo.percent)
    : Math.min(promo.fixedTiyin, subtotal);
}

/** A line resolved against the catalogue, for anything that draws one. */
export type ResolvedLine = {
  line: CartLine;
  dish: Dish;
  portion: Portion;
  modifiers: readonly Modifier[];
  /** Tiyin for one of them, size and extras included. VAT is already inside. */
  unitPrice: number;
  /** Tiyin for the whole line. */
  linePrice: number;
};

type CartApi = {
  lines: readonly CartLine[];
  resolved: readonly ResolvedLine[];
  /** How many items, not how many lines — the dock badge counts plates. */
  count: number;
  /** Tiyin, before any discount, service or delivery. */
  subtotal: number;
  add: (line: Omit<CartLine, 'key'>) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;

  /* ---- the order's intent, which outlives any one screen ---------------- */

  channel: CustomerChannel;
  setChannel: (channel: CustomerChannel) => void;
  /** Which kitchen cooks it. Carries the delivery fee, so it is never null. */
  branchId: string;
  setBranch: (branchId: string) => void;
  promo: AppliedPromo | null;
  /**
   * Ask the server whether this word is worth anything on this basket.
   *
   * Asynchronous because the answer is not this app's to give. `PROMO_CODES` in
   * the surfaces package says why in its own docblock — "a client that decides
   * its own discount decides its own price" — and it now serves only as the
   * fallback for a browser that cannot reach the API, so the demo still walks
   * both paths with no server running.
   */
  applyPromo: (code: string, lang: Lang) => Promise<PromoOutcome>;
  clearPromo: () => void;

  /* ---- the catalogue these lines were built against --------------------- */

  /** The menu every screen is drawing, live or fixture. */
  menu: CustomerMenu;
  /** The venues, and their real delivery fees. */
  venues: readonly Branch[];
  /**
   * Whether this basket can become an order.
   *
   * False when the menu is the fixture one: those dish ids are words, and the
   * ordering endpoint prices every line through the catalogue and refuses what
   * it was never offered. A screen shows the difference rather than letting a
   * guest fill a basket and be refused at the last tap.
   */
  orderable: boolean;
  /** The venue's own delivery fee in tiyin, from the branch the guest picked. */
  deliveryFee: number;

  /* ---- the order once it exists ---------------------------------------- */

  /**
   * The bill number the server gave this browser's order, if it has one.
   *
   * The tracking screen's first credential — `GET /public/orders/{number}` takes
   * the number and the last four digits of the phone that placed it, and neither
   * is a session. Held here rather than in the URL alone so a guest who reopens
   * the tab still lands on their own delivery.
   */
  placed: string | null;
  /** The number the tracking screen proves itself with, digits only. */
  placedPhone: string | null;
  markPlaced: (number: string, phone: string) => void;
};

const CartContext = createContext<CartApi | null>(null);

/**
 * A line's identity: the dish, the size and the extras it was ordered with.
 *
 * Deriving the key rather than generating one is what makes tapping "add" twice
 * on the same configuration produce a quantity of two instead of two identical
 * rows — which is what a guest means, and what a kitchen wants on the docket.
 * The note is deliberately NOT part of it: two portions of the same dish where
 * one says "no onion" are the same line to a guest and two different dishes to a
 * cook, so they must not merge.
 */
function keyOf(line: Omit<CartLine, 'key'>): string {
  return [line.dishId, line.portionId, [...line.modifierIds].sort().join('+'), line.note].join('|');
}

export function CartProvider({
  children,
  menu = DEMO_MENU,
  venues = DEMO_VENUES,
}: {
  children: ReactNode;
  /** The catalogue the screens are drawing. Fetched once, in the layout. */
  menu?: CustomerMenu;
  venues?: CustomerVenues;
}) {
  const [lines, setLines] = useState<readonly CartLine[]>([]);
  const [channel, setChannel] = useState<CustomerChannel>('delivery');
  /*
   * The first branch, not "none chosen".
   *
   * A null branch would make the cart quote a total with no delivery fee in it
   * and then raise the price at the payment screen, which is the one moment an
   * order gets abandoned. The guest can change it; they cannot arrive at a
   * quote that was never true.
   */
  const [branchId, setBranchId] = useState<string>(venues.branches[0]?.id ?? '');
  const [promo, setPromo] = useState<AppliedPromo | null>(null);
  const [placed, setPlaced] = useState<{ number: string; phone: string } | null>(null);

  const value = useMemo<CartApi>(() => {
    const resolved: ResolvedLine[] = [];

    /*
     * The live catalogue first, the fixtures behind it.
     *
     * Both maps rather than one, because a guest can have a basket from before
     * the API answered: the dish ids in it are fixture words, and dropping
     * those lines silently would empty somebody's cart on a reconnect. They
     * resolve, they draw, and `orderable` below is what stops them being sent.
     */
    const dishes = new Map<string, Dish>(menu.dishes.map((dish) => [dish.id, dish]));
    const choices = new Map<string, Modifier>(
      menu.dishes.flatMap((dish) =>
        (dish.groups ?? []).flatMap((group) =>
          group.choices.map((choice) => [choice.id, choice] as const),
        ),
      ),
    );

    for (const line of lines) {
      const dish = dishes.get(line.dishId) ?? DISH_BY_ID.get(line.dishId);
      const portion = PORTION_BY_ID.get(line.portionId);

      /*
       * A line whose dish has gone is dropped from the view rather than drawn
       * broken. It can happen: the catalogue is refetched and a dish was 86'd or
       * deleted between the tap and the render. The cart screen counts what it
       * can show, so a vanished dish cannot be paid for.
       */
      if (dish === undefined || portion === undefined) continue;

      const modifiers = line.modifierIds
        .map((id) => choices.get(id) ?? MODIFIER_BY_ID.get(id))
        .filter((modifier): modifier is Modifier => modifier !== undefined);

      /*
       * A live dish carries no portion delta, and that is not an omission: a
       * size is a MODIFIER on this platform, priced by the kitchen into a
       * choice. `PORTIONS` is three fixture sizes with invented deltas, and
       * adding 12 000 so'm to a live price because a guest tapped "Katta" would
       * be this client inventing money.
       */
      const sizing = dish.groups === undefined ? portion.delta : 0;

      const unitPrice =
        dish.price + sizing + modifiers.reduce((sum, modifier) => sum + modifier.price, 0);

      resolved.push({
        line,
        dish,
        portion,
        modifiers,
        unitPrice,
        linePrice: unitPrice * line.quantity,
      });
    }

    // Hoisted because `applyPromo` has to weigh the basket against the code's
    // floor, and a field of the object being built cannot read its own siblings.
    const subtotal = resolved.reduce((sum, entry) => sum + entry.linePrice, 0);

    return {
      lines,
      resolved,
      count: resolved.reduce((sum, entry) => sum + entry.line.quantity, 0),
      subtotal,

      add: (incoming) =>
        setLines((current) => {
          const key = keyOf(incoming);
          const existing = current.find((line) => line.key === key);

          if (existing === undefined) return [...current, { ...incoming, key }];

          return current.map((line) =>
            line.key === key ? { ...line, quantity: line.quantity + incoming.quantity } : line,
          );
        }),

      setQuantity: (key, quantity) =>
        setLines((current) =>
          // Zero removes it — the store's contract, so a caller never has to
          // filter the list itself. The *stepper* stops at one; removing is its
          // own named control, because a minus button that deletes a row is not
          // what a minus button does. See `CartRow`.
          quantity < 1
            ? current.filter((line) => line.key !== key)
            : current.map((line) => (line.key === key ? { ...line, quantity } : line)),
        ),

      remove: (key) => setLines((current) => current.filter((line) => line.key !== key)),

      clear: () => {
        setLines([]);
        // The promo goes with the basket it was checked against. Left behind, it
        // would be re-applied to the next order without passing its floor again.
        setPromo(null);
      },

      channel,
      setChannel,
      branchId,
      setBranch: setBranchId,
      promo,

      /*
       * Validated here rather than on the screen, because the floor is a fact
       * about the basket and the screen only knows what it was handed. The
       * server will own this the day campaigns are real; the shape of the
       * answer will not change.
       */
      applyPromo: async (raw, lang) => {
        const code = raw.trim().toUpperCase();

        if (code === '') return 'empty';
        if (promo !== null && promo.code === code) return 'already';

        const answer = await checkPromo(lang, code, subtotal);

        if (answer.ok) {
          setPromo({
            code: answer.data.code,
            percent: answer.data.kind === 'percent' ? answer.data.value : 0,
            fixedTiyin: answer.data.kind === 'percent' ? 0 : answer.data.discount_tiyin,
            freeDelivery: answer.data.kind === 'free_delivery',
          });

          return 'ok';
        }

        /*
         * The server said no, and which no it said matters. `promo.min_not_met`
         * is the only refusal a guest can act on — add a drink and try again —
         * so it keeps its own outcome; everything else the cart can express is
         * "that code does not work".
         */
        if (answer.error === 'promo.min_not_met') return 'floor';
        if (answer.error !== 'offline' && answer.error !== 'api_unreachable') return 'unknown';

        /*
         * No network. Fall back to the fixture rule rather than refusing a
         * code that may well be real: this app is built to keep working with
         * the API down, and the same three codes are seeded server-side by
         * `CrmPromoSeeder` precisely so the two agree.
         */
        const percent = PROMO_CODES[code];

        if (percent === undefined) return 'unknown';
        if (subtotal < PROMO_MINIMUM) return 'floor';

        setPromo({ code, percent, fixedTiyin: 0, freeDelivery: false });

        return 'ok';
      },

      clearPromo: () => setPromo(null),

      menu,
      venues: venues.branches,
      /*
       * Orderable when the catalogue came from a kitchen AND every line in the
       * basket did. The second half matters on its own: a guest who filled a
       * basket while the API was down keeps it when the API comes back, and
       * those lines still carry fixture ids that the server would refuse.
       */
      orderable:
        menu.live && resolved.every((entry) => Number.isInteger(Number(entry.line.dishId))),
      deliveryFee:
        venues.branches.find((branch) => branch.id === branchId)?.deliveryFee ??
        BRANCH_BY_ID.get(branchId)?.deliveryFee ??
        0,

      placed: placed?.number ?? null,
      placedPhone: placed?.phone ?? null,
      markPlaced: (number, phone) => setPlaced({ number, phone }),
    };
    // `subtotal` is absent deliberately: it is derived from `lines`, which is here.
  }, [lines, channel, branchId, promo, placed, menu, venues]);

  return <CartContext value={value}>{children}</CartContext>;
}

/**
 * The basket, from anywhere inside the customer app.
 *
 * Throws rather than returning null when the provider is missing: a screen that
 * silently rendered an empty cart because it was mounted outside the tree would
 * look like a guest's order had been lost, and would be found by the guest.
 */
export function useCart(): CartApi {
  const cart = useContext(CartContext);

  if (cart === null) {
    throw new Error('useCart() outside <CartProvider> — the basket has no home here.');
  }

  return cart;
}
