import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  BRANCHES,
  DISH_BY_ID,
  FREE_DELIVERY_OVER,
  MODIFIER_BY_ID,
  PORTION_BY_ID,
  PROMO_CODES,
  PROMO_MINIMUM,
  type Branch,
  type Dish,
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

import { checkPromo } from '../customer/account';
import type { Lang } from './locale';

/**
 * The basket, held outside React entirely.
 *
 * The web build keeps the same shape in a `CartProvider` wrapped around the
 * whole customer surface (`apps/web/src/app/(customer)/cart-store.tsx`). This is
 * that store, and the contract is deliberately identical — same line key, same
 * `PromoOutcome` vocabulary, same "quantity below one removes the row" rule — so
 * a fix to one is a legible fix to the other.
 *
 * **Why not a provider.** The only component that wraps every customer screen is
 * `(customer)/customer/_layout.tsx`, the tab layout. A basket held there dies the
 * moment expo-router re-creates the navigator, and more to the point the module
 * has to be readable from a screen that is *not* under those tabs — the dish
 * sheet opens over the home screen and adds a line from inside a `Modal`, which
 * is its own React root on Android. A module-level store has no tree to be
 * inside of.
 *
 * **Why not SecureStore.** `storage.ts` is the Keychain and the Keystore, and it
 * is for credentials. A basket is not a secret; writing one there would cost a
 * keychain transaction per tap of the quantity stepper, and a basket that
 * survived a reinstall would quote yesterday's prices at a menu that has moved.
 * The basket lives as long as the process, which is exactly as long as the
 * guest's session with it.
 *
 * **Money is never computed here.** A line knows its dish, its size and its
 * extras; what the order comes to is `@restaurant/surfaces/money`, which mirrors
 * `App\Support\Orders\BillTotals`. Two places that both add up a bill is how a
 * phone quotes one number and the printed cheque another, in front of a guest.
 *
 * ---------------------------------------------------------------------------
 * The catalogue is handed in, never imported
 *
 * A line used to be resolved against `DISH_BY_ID` — the fixtures — which meant
 * every basket in this app was built out of dish ids that are words (`osh`) and
 * exist in no restaurant's database. `POST /api/v1/public/orders` prices every
 * line through `MenuCatalog` and refuses what it was never offered, so such a
 * basket is refused in full, at the last tap. The store now resolves against
 * whatever catalogue the screens hand it (see {@link useCatalogue}), and says
 * on `orderable` whether what it holds can be sent at all.
 */

export type CartLine = {
  /**
   * The line's own id, not the dish's.
   *
   * Two lines of the same dish are ordinary — one with extra meat, one without —
   * and they have to be removable independently.
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
 * Two of the API's four `orders.channel` values. A guest sitting at a table
 * orders through the QR surface, where the table number is in the URL; this app
 * is opened from a sofa. Neither is charged service — `billTotals()` decides
 * that, not this type.
 */
export type CustomerChannel = 'delivery' | 'takeaway';

/**
 * A promo code that passed, kept with what it was worth when it did.
 *
 * `percent` for a percentage campaign — recomputed against the basket, so a
 * guest who applies 15% and then adds a lavash sees the discount grow.
 * `fixedTiyin` for the other two kinds: a coupon worth a flat amount, or a free
 * delivery that is worth nothing off the food line. Exactly one is non-zero.
 */
export type AppliedPromo = {
  code: string;
  percent: number;
  fixedTiyin: number;
  freeDelivery: boolean;
};

/**
 * What a code took off this basket, in tiyin.
 *
 * A function rather than a stored number, because a percentage has to follow
 * the basket. A flat coupon does not, and is floored at the basket so a bill
 * can never go negative.
 */
export function promoDiscount(promo: AppliedPromo | null, subtotal: number): number {
  if (promo === null) return 0;

  return promo.percent > 0
    ? percentOf(subtotal, promo.percent)
    : Math.min(promo.fixedTiyin, subtotal);
}

/**
 * Why a code was refused, in the vocabulary the cart screen has copy for.
 *
 * Returned rather than thrown, and never rendered raw: the screen maps each case
 * onto a sentence that says what to do about it. `empty` is a real case — an
 * apply button pressed over an empty field is a guest who typed nothing.
 */
export type PromoOutcome = 'ok' | 'empty' | 'already' | 'unknown' | 'floor';

/** A line resolved against the catalogue, for anything that draws one. */
export type ResolvedLine = {
  line: CartLine;
  dish: Dish;
  /**
   * The size, and `null` on every live dish.
   *
   * Not an omission: a size is a MODIFIER on this platform, priced by the
   * kitchen inside `dish.groups`, so a live line has no portion to name. The
   * three `PORTIONS` are a demo's three sizes and apply only to a fixture dish.
   */
  portion: Portion | null;
  modifiers: readonly Modifier[];
  /** Tiyin for one of them, size and extras included. VAT is already inside. */
  unitPrice: number;
  /** Tiyin for the whole line. */
  linePrice: number;
};

type CartState = {
  lines: readonly CartLine[];
  channel: CustomerChannel;
  branchId: string;
  promo: AppliedPromo | null;
  /** The catalogue every line is priced against. See {@link useCatalogue}. */
  menu: CustomerMenu;
  /** The venues a guest may order from, with their real delivery fees. */
  venues: CustomerVenues;
  /**
   * The bill number this install is waiting on, and the number that placed it.
   *
   * Both, because either alone is useless: `GET /api/v1/public/orders/{number}`
   * is guarded by the bill number AND the last four digits of the phone that
   * ordered — bill numbers are sequential per restaurant, so an endpoint that
   * answered on the number alone would hand a stranger somebody's address one
   * keystroke at a time.
   *
   * Null for a guest who has ordered nothing on this install, which is what
   * makes the tracking screen show its empty state rather than a stranger's
   * delivery.
   */
  placed: string | null;
  placedPhone: string | null;
};

/**
 * The branch a quote is priced against, when the catalogue somehow has none.
 *
 * `noUncheckedIndexedAccess` is on, so `BRANCHES[0]` is `Branch | undefined` and
 * TypeScript cannot know a fixture has rows. Unwrapping that on every screen is
 * how one screen eventually forgets and prices a delivery at nothing. This is
 * unreachable while `BRANCHES` has entries, and charges no fee if it ever does
 * not — a zero fee is the only guess that cannot overcharge somebody.
 */
const FALLBACK_BRANCH: Branch = BRANCHES[0] ?? {
  id: 'none',
  name: '—',
  address: '',
  km: null,
  eta: '',
  deliveryFee: 0,
};

/*
 * The first branch, not "none chosen".
 *
 * A null branch would make the cart quote a total with no delivery fee in it and
 * then raise the price at the payment screen, which is the one moment an order
 * gets abandoned. The guest can change it; they cannot arrive at a quote that was
 * never true.
 */
let state: CartState = {
  lines: [],
  channel: 'delivery',
  branchId: FALLBACK_BRANCH.id,
  promo: null,
  menu: DEMO_MENU,
  venues: DEMO_VENUES,
  placed: null,
  placedPhone: null,
};

const listeners = new Set<() => void>();

/**
 * The snapshot `useSyncExternalStore` compares by identity.
 *
 * Every mutation replaces the whole object, and nothing ever mutates one in
 * place — a store that edits its own snapshot is a store whose subscribers never
 * re-render, which is the single failure mode this hook has.
 */
function commit(next: CartState): void {
  state = next;

  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

const snapshot = (): CartState => state;

/**
 * A line's identity: the dish, the size and the extras it was ordered with.
 *
 * Deriving the key rather than generating one is what makes tapping "add" twice
 * on the same configuration produce a quantity of two instead of two identical
 * rows. The note is deliberately part of it: two portions of one dish where one
 * says "no onion" are the same line to a guest and two different plates to a
 * cook, so they must not merge.
 */
function keyOf(line: Omit<CartLine, 'key'>): string {
  return [line.dishId, line.portionId, [...line.modifierIds].sort().join('+'), line.note].join('|');
}

/**
 * One extra, looked up where it can honestly come from.
 *
 * A live dish carries the kitchen's own sheet and its own numeric option ids, so
 * a choice that is not in this dish's groups is not an extra this dish has —
 * falling through to `MODIFIER_BY_ID` there would price a demo's "extra meat"
 * onto a real plate. A fixture dish has no groups at all and reads the fixtures.
 */
function modifierOf(dish: Dish, id: string): Modifier | undefined {
  if (dish.groups === undefined) return MODIFIER_BY_ID.get(id);

  for (const group of dish.groups) {
    const choice = group.choices.find((entry) => entry.id === id);

    if (choice !== undefined) return choice;
  }

  return undefined;
}

/**
 * Every line, priced against the catalogue the store was handed.
 *
 * The live menu first and the fixtures behind it, so a line added before the
 * catalogue arrived still draws rather than vanishing out of the basket. It
 * cannot be ORDERED — `orderable` below is false the moment a dish id is not
 * numeric — and saying that on the checkout button is a great deal better than
 * a row that silently disappears while somebody is looking at it.
 */
function resolve(current: CartState): ResolvedLine[] {
  const byId = new Map<string, Dish>();

  for (const dish of current.menu.dishes) byId.set(dish.id, dish);

  const resolved: ResolvedLine[] = [];

  for (const line of current.lines) {
    const dish = byId.get(line.dishId) ?? DISH_BY_ID.get(line.dishId);

    /*
     * A line whose dish has gone is dropped from the view rather than drawn
     * broken. It happens: the catalogue is refetched and a dish was 86'd or
     * deleted between the tap and the render. The screen counts what it can
     * show, so a vanished dish cannot be paid for.
     */
    if (dish === undefined) continue;

    /*
     * The size delta applies to a fixture dish and to nothing else.
     *
     * On a live menu the kitchen prices its own sizes as modifier choices, so
     * adding `PORTIONS`' invented ±6 000 on top would be a phone quoting a
     * figure the restaurant never set — the drift `pricing.ts` warns about,
     * arriving at the moment somebody is asked to pay.
     */
    const portion = dish.groups === undefined ? (PORTION_BY_ID.get(line.portionId) ?? null) : null;

    if (dish.groups === undefined && portion === null) continue;

    const modifiers = line.modifierIds
      .map((id) => modifierOf(dish, id))
      .filter((modifier): modifier is Modifier => modifier !== undefined);

    const unitPrice =
      dish.price + (portion?.delta ?? 0) + modifiers.reduce((sum, extra) => sum + extra.price, 0);

    resolved.push({
      line,
      dish,
      portion,
      modifiers,
      unitPrice,
      linePrice: unitPrice * line.quantity,
    });
  }

  return resolved;
}

const subtotalOf = (current: CartState): number =>
  resolve(current).reduce((sum, entry) => sum + entry.linePrice, 0);

/**
 * A restaurant that published its venues and has none.
 *
 * Not the same case as "the API did not answer", and it must not be priced the
 * same way: falling through to the fixture there would quote the demo's 12 000
 * so'm carriage for a venue nobody has described. Zero is the only fee that
 * cannot overcharge somebody, and the em dash is what a screen draws when it
 * has no name to print.
 */
const NO_VENUE: Branch = { id: 'none', name: '—', address: '', km: null, eta: '', deliveryFee: 0 };

/** The venue a quote is priced against: the chosen one, or the first there is. */
const branchOf = (current: CartState): Branch =>
  current.venues.branches.find((venue) => venue.id === current.branchId) ??
  current.venues.branches[0] ??
  (current.venues.live ? NO_VENUE : FALLBACK_BRANCH);

/**
 * Everything that changes the basket, in one object.
 *
 * Actions live beside the store rather than on the snapshot: a snapshot that
 * carried its own methods would be a new object on every render, and the whole
 * point of the snapshot is that it is not.
 */
export const cart = {
  add(incoming: Omit<CartLine, 'key'>): void {
    const key = keyOf(incoming);
    const existing = state.lines.find((line) => line.key === key);

    commit({
      ...state,
      lines:
        existing === undefined
          ? [...state.lines, { ...incoming, key }]
          : state.lines.map((line) =>
              line.key === key ? { ...line, quantity: line.quantity + incoming.quantity } : line,
            ),
    });
  },

  /**
   * Zero removes the row — the store's contract, so no caller has to filter the
   * list itself. The *stepper* stops at one, because a minus button that deletes
   * a row is not what a minus button does; removing is its own named control.
   */
  setQuantity(key: string, quantity: number): void {
    commit({
      ...state,
      lines:
        quantity < 1
          ? state.lines.filter((line) => line.key !== key)
          : state.lines.map((line) => (line.key === key ? { ...line, quantity } : line)),
    });
  },

  remove(key: string): void {
    commit({ ...state, lines: state.lines.filter((line) => line.key !== key) });
  },

  /**
   * Empties the basket and the code with it.
   *
   * The promo goes with the basket it was checked against. Left behind, it would
   * be re-applied to the next order without passing its floor again. `placed` is
   * deliberately untouched: the order that emptied this basket is still out for
   * delivery, and the tracking screen reads that number.
   */
  clear(): void {
    commit({ ...state, lines: [], promo: null });
  },

  setChannel(channel: CustomerChannel): void {
    commit({ ...state, channel });
  },

  setBranch(branchId: string): void {
    commit({ ...state, branchId });
  },

  /**
   * The catalogue this basket is priced against.
   *
   * Handed in rather than fetched here, and the reason is the shape of the
   * store: it is a module, not a component, so it has no place to run an effect
   * and no language to fetch in. `null` means "no news about this half" — the
   * menu and the venues come from two endpoints that answer at their own speeds,
   * and a screen that has one must not clear the other.
   *
   * Nothing is committed when neither reference moved. The menu hook re-asks
   * every minute and hands back a fresh object each time; a commit per poll
   * would re-render every basket subscriber for a menu that did not change, and
   * a commit during a render would be a loop.
   */
  setCatalogue(menu: CustomerMenu | null, venues: CustomerVenues | null): void {
    /*
     * A catalogue that has been a kitchen's does not go back to being a sample.
     *
     * The hooks answer `DEMO_MENU` on any refusal, including one failed poll on
     * a phone that walked into a lift. Taking that would drop every live line
     * out of the basket — a numeric dish id exists in no fixture — so a guest
     * with four dishes in the cart would watch it empty itself, and the payment
     * screen would bounce them back to it. The screens still say "sample menu"
     * over what they are BROWSING, which is the honest half; the basket keeps
     * the catalogue it was priced against. Same for the venues, where the
     * downgrade would re-price carriage at the fixture's invented 12 000.
     */
    const next = menu === null || (state.menu.live && !menu.live) ? state.menu : menu;
    const nextVenues =
      venues === null || (state.venues.live && !venues.live) ? state.venues : venues;

    if (next === state.menu && nextVenues === state.venues) return;

    /*
     * A branch id from the fixtures cannot survive a live venue list.
     *
     * The store opens on `chilonzor` — a slug — and a live list carries numeric
     * branch ids. Left alone, the chip rail would draw the live venues with none
     * of them selected, and `placeOrderPayloadFrom()` would drop `branch_id`
     * entirely because a slug is not a number: the order would land at whatever
     * venue the server picked. Adopting the resolved venue is what makes the
     * chosen chip and the ordered branch the same place.
     */
    const branchId =
      nextVenues.live && !nextVenues.branches.some((venue) => venue.id === state.branchId)
        ? (nextVenues.branches[0]?.id ?? state.branchId)
        : state.branchId;

    commit({ ...state, menu: next, venues: nextVenues, branchId });
  },

  /**
   * Ask the server whether this word is worth anything on this basket.
   *
   * The decision is not this app's to make: `PROMO_CODES` in the surfaces
   * package says why in its own docblock — "a client that decides its own
   * discount decides its own price" — and it now serves only as the fallback
   * for a phone that cannot reach the API, so both paths through the screen
   * still walk with no server running. The three codes it knows are the same
   * three `CrmPromoSeeder` writes, precisely so the two agree.
   *
   * Either way this is a PREVIEW. `POST /api/v1/public/orders` re-prices the
   * code against the basket it built, and what comes back on `data.promo` is
   * the only discount that reached a row.
   */
  async applyPromo(raw: string, lang: Lang): Promise<PromoOutcome> {
    const code = raw.trim().toUpperCase();

    if (code === '') return 'empty';
    if (state.promo !== null && state.promo.code === code) return 'already';

    const answer = await checkPromo(lang, code, subtotalOf(state));

    if (answer.ok) {
      commit({
        ...state,
        promo: {
          code: answer.data.code,
          percent: answer.data.kind === 'percent' ? answer.data.value : 0,
          fixedTiyin: answer.data.kind === 'percent' ? 0 : answer.data.discount_tiyin,
          freeDelivery: answer.data.kind === 'free_delivery',
        },
      });

      return 'ok';
    }

    /*
     * Which refusal it was matters. `promo.min_not_met` is the only one a guest
     * can act on — add a drink and try again — so it keeps its own outcome;
     * everything else this screen can express is "that code does not work".
     */
    if (answer.code === 'promo.min_not_met') return 'floor';
    if (answer.code !== 'offline' && answer.code !== 'unknown') return 'unknown';

    const percent = PROMO_CODES[code];

    if (percent === undefined) return 'unknown';
    if (subtotalOf(state) < PROMO_MINIMUM) return 'floor';

    commit({ ...state, promo: { code, percent, fixedTiyin: 0, freeDelivery: false } });

    return 'ok';
  },

  clearPromo(): void {
    commit({ ...state, promo: null });
  },

  /**
   * The order this install is now waiting on.
   *
   * The number the server minted, never one this app invented, and the phone it
   * was placed with — the two halves of the tracking credential. The phone is
   * kept whole here and cut to its last four digits at the request, because the
   * screen also prints nothing of it and a number in a URL is a number in a
   * proxy log.
   */
  markPlaced(number: string, phone: string): void {
    commit({ ...state, placed: number, placedPhone: phone });
  },
};

export type CartView = {
  lines: readonly CartLine[];
  resolved: readonly ResolvedLine[];
  /** How many plates, not how many rows — the dock badge counts plates. */
  count: number;
  /** Tiyin, before any discount, service or delivery. */
  subtotal: number;
  channel: CustomerChannel;
  branchId: string;
  /** Resolved, never null: it carries the delivery fee every quote needs. */
  branch: Branch;
  /** The catalogue the lines were priced against, and whether a kitchen set it. */
  menu: CustomerMenu;
  /** The venues to choose from, and whether a restaurant published them. */
  venues: CustomerVenues;
  /**
   * Whether this basket can become an order at all.
   *
   * Live menu, at least one line, and every dish id a number the server can
   * look up. A basket built from `DEMO_MENU` holds words for ids, and the
   * ordering endpoint refuses the whole thing — so the checkout button says why
   * BEFORE the guest commits rather than after.
   */
  orderable: boolean;
  /** What carrying this basket costs, tiyin: the venue's own fee, or nothing. */
  deliveryFee: number;
  promo: AppliedPromo | null;
  /** The bill number of the order this install placed, or null. */
  placed: string | null;
  /** The number that placed it — the other half of the tracking credential. */
  placedPhone: string | null;
};

/**
 * The basket, from any screen.
 *
 * No provider and therefore no "used outside its tree" failure — the store is a
 * module, and a screen that imports it has it. The derived half is memoised on
 * the snapshot's identity, so a screen that only reads `count` still re-renders
 * once per change and not once per keystroke elsewhere.
 */
export function useCart(): CartView {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);

  return useMemo<CartView>(() => {
    const resolved = resolve(current);
    const subtotal = resolved.reduce((sum, entry) => sum + entry.linePrice, 0);
    const branch = branchOf(current);

    return {
      lines: current.lines,
      resolved,
      count: resolved.reduce((sum, entry) => sum + entry.line.quantity, 0),
      subtotal,
      channel: current.channel,
      branchId: current.branchId,
      branch,
      menu: current.menu,
      venues: current.venues,
      orderable:
        current.menu.live &&
        resolved.length > 0 &&
        resolved.every((entry) => Number.isInteger(Number(entry.dish.id))),
      /*
       * The threshold is applied here rather than on three screens.
       *
       * The cart, the payment screen and the order all have to agree about what
       * carriage costs, and the free-delivery line is the one a guest checks
       * against the total. The fee itself is the VENUE's — `delivery_fee_tiyin`
       * from `GET /api/v1/public/branches` — not the fixture's flat 12 000,
       * because the server recomputes it from the same setting when it prices
       * the bill.
       */
      deliveryFee:
        current.channel === 'delivery' && subtotal < FREE_DELIVERY_OVER ? branch.deliveryFee : 0,
      promo: current.promo,
      placed: current.placed,
      placedPhone: current.placedPhone,
    };
  }, [current]);
}

/**
 * Hand the store the catalogue a screen has just fetched.
 *
 * A hook rather than a bare setter, and a hook that takes values rather than
 * fetching them, for two reasons. The store is a module and cannot run an
 * effect; and the two endpoints behind these values are asked by the screens
 * that draw them — the menu screen polls the catalogue every minute for the
 * stop list, the cart screen only ever needs the venues. Writing through an
 * effect keyed on identity is what keeps the write out of a render pass, which
 * is where it would be a loop.
 *
 * `null` for either half means "this screen has no news about it".
 */
export function useCatalogue(menu: CustomerMenu | null, venues: CustomerVenues | null): void {
  useEffect(() => {
    cart.setCatalogue(menu, venues);
  }, [menu, venues]);
}
