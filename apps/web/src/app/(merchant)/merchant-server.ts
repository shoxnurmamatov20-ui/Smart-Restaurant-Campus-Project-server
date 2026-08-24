import { apiGet } from '@/lib/api-server';

import {
  AD_SLOTS,
  CATALOGUE_CATEGORIES,
  DISPUTES,
  MERCHANT_DISHES,
  MERCHANT_ORDERS,
  PROMO_BUDGET,
  PROMO_TEXT,
  PROMOTIONS,
  SETTLEMENT_HISTORY,
  type CatalogueCategory,
  type CatalogueDish,
  type Dispute,
  type MerchantQueueOrder,
  type OrderState,
  type Promotion,
  type PromotionState,
  type SettlementRow,
  type Trilingual,
} from './merchant-data';

/**
 * The merchant panel, from the server.
 *
 * Server half of `./merchant-data.ts` — types and fixtures there, server calls
 * here, and only server components import this. The same split every console
 * screen follows; `tables-server.ts` explains why.
 *
 * This side is ordinary. A merchant is a member of staff with a restaurant and
 * a role, so `apiGet` does exactly what it does everywhere else: the console
 * session goes up as a bearer, the policies scope every row to that restaurant,
 * and `null` means "draw the fixtures". The unusual half of this module lives
 * in `(marketplace)/mp-server.ts`, where the reader has no restaurant at all.
 */

/** `GET /api/v1/marketplace/orders` — one card in the queue. */
type ApiMerchantOrder = {
  id: number;
  number: string;
  state: string;
  seconds_to_answer: number | null;
  customer: string | null;
  address: string;
  address_note: string | null;
  lines: readonly {
    name: Trilingual;
    quantity: number;
    line_total_tiyin: number;
    note: string | null;
  }[];
  gross_tiyin: number;
  commission_percent: number;
  commission_tiyin: number;
  merchant_due_tiyin: number;
  pay_rail: string;
  placed_at: string | null;
  /** What the restaurant has promised, in minutes from acceptance. */
  eta_minutes: number | null;
};

/** `GET /api/v1/marketplace/catalogue` — one row of the price table. */
type ApiCatalogueRow = {
  menu_item_id: number;
  title: string;
  section: string;
  house_price_tiyin: number;
  markup_tiyin: number;
  market_price_tiyin: number;
  is_listed: boolean;
};

/** `GET /api/v1/marketplace/settlements`. */
type ApiSettlement = {
  id: number;
  invoice_number: string;
  period_start: string;
  period_end: string;
  gross_tiyin: number;
  commission_tiyin: number;
  payable_tiyin: number;
  state: string;
};

/** `GET /api/v1/marketplace/disputes`. */
type ApiDispute = {
  id: number;
  order_number: string | null;
  kind: string;
  amount_tiyin: number;
  body: string | null;
  automatic: boolean;
  state: string;
  hours_left: number | null;
};

/** `GET /api/v1/marketplace/performance`. */
export type MerchantPerformance = {
  windowDays: number;
  orders: number;
  /** Seconds, averaged over the orders that were ACCEPTED — see the endpoint. */
  acceptSeconds: number | null;
  /** Basis points, so no float reaches a screen: 4.35% is 435. */
  rejectRateBp: number;
  cancelRateBp: number;
  rating: number;
  reviewsCount: number;
  acceptSecondsAllowed: number;
  live: true;
};

/**
 * The nine states the server tracks, as the five the panel draws.
 *
 * The panel's vocabulary was drawn before the module existed and is the shorter
 * one — a cook does not distinguish "ready" from "a courier has it", they are
 * both "off my pass". Written out rather than inferred so a tenth server state
 * lands in `default` and is visible rather than silently becoming `new`.
 */
const QUEUE_STATE: Readonly<Record<string, OrderState>> = {
  placed: 'new',
  accepted: 'cooking',
  cooking: 'cooking',
  ready: 'ready',
  courier_assigned: 'ready',
  enroute: 'ready',
  delivered: 'done',
  cancelled: 'rejected',
  rejected: 'rejected',
};

/** The three rails the panel knows; anything else is settled off-platform. */
const PAY_RAIL: Readonly<Record<string, MerchantQueueOrder['pay']>> = {
  click: 'click',
  payme: 'payme',
  uzum: 'click',
  cash: 'cash',
};

export function queueFrom(row: ApiMerchantOrder): MerchantQueueOrder {
  const trilingual = (text: string): Trilingual => ({ uz: text, ru: text, en: text });

  return {
    id: String(row.id),
    number: row.number,
    state: QUEUE_STATE[row.state] ?? 'new',
    // A kitchen calls out a name. The phone number stays with the platform —
    // the design promises a masked callback rather than handing it over.
    customer: row.customer ?? '—',
    address: trilingual(
      row.address_note === null ? row.address : `${row.address} · ${row.address_note}`,
    ),
    lines: row.lines.map((line) => ({
      quantity: line.quantity,
      name: line.name,
      amount: line.line_total_tiyin,
    })),
    gross: row.gross_tiyin,
    // The platform's cut for THIS order, at THIS store's rate — see the type.
    fee: row.commission_tiyin,
    feePercent: row.commission_percent,
    pay: PAY_RAIL[row.pay_rail] ?? 'cash',
    /*
     * Only on a card that is still counting. `undefined` rather than zero,
     * because the board reads the field's presence to decide whether to draw a
     * countdown at all — a zero would put an expired clock beside every order
     * the restaurant answered last Tuesday.
     */
    ...(row.seconds_to_answer === null ? {} : { secondsLeft: row.seconds_to_answer }),
    /*
     * The promise as the server holds it, so "+10 minutes" adds to the number
     * the guest is counting down from rather than to one the browser invented.
     * Absent on a row that has none: an order nobody has accepted yet has not
     * been promised anything.
     */
    ...(row.eta_minutes === null ? {} : { etaMinutes: row.eta_minutes }),
  };
}

/**
 * One row, with its section already resolved to the chip number the board
 * filters by.
 *
 * The chip is a NUMBER on this screen and a section TITLE on the endpoint, so
 * something has to map between them — and it has to be the section rather than
 * the row. Numbering each dish in turn (which is what this did first) gives
 * every dish its own category, so every chip but "all" empties the table: a
 * filter that looks like it works until somebody uses it.
 */
export function catalogueFrom(row: ApiCatalogueRow, chip: number): CatalogueDish {
  return {
    id: String(row.menu_item_id),
    category: chip,
    name: { uz: row.title, ru: row.title, en: row.title },
    housePrice: row.house_price_tiyin,
    marketPrice: row.market_price_tiyin,
    /*
     * There is no food cost on this endpoint and there should not be: a recipe
     * is `Modules/Inventory`'s, it is the most commercially sensitive number a
     * restaurant holds, and the marketplace has no business reading it. Zero is
     * the honest answer rather than a guess the margin column would render.
     */
    foodCost: 0,
    // Nor a thirty-day unit count — that is an Analytics question, and this
    // endpoint answers what is in the window rather than how it sold.
    sold: 0,
    ...(row.is_listed ? {} : { stopped: true }),
  };
}

export function settlementFrom(row: ApiSettlement): SettlementRow {
  return {
    /*
     * The numeric key, which is what makes the statement openable.
     *
     * The printed `invoice_number` is what a merchant reads down the phone and
     * is deliberately not this: the fixture history carries invented ones, so a
     * document link built from the printed number would open somebody else's
     * week. `id` is absent on a fixture row and the buttons say so.
     */
    id: row.id,
    period: `${row.period_start} – ${row.period_end}`,
    invoice: row.invoice_number,
    gross: row.gross_tiyin,
    fee: row.commission_tiyin,
    state: row.state === 'paid' ? 'paid' : 'due',
  };
}

export function disputeFrom(row: ApiDispute): Dispute {
  const words = (text: string): Trilingual => ({ uz: text, ru: text, en: text });

  return {
    id: String(row.id),
    kind: words(row.kind),
    number: row.order_number ?? '—',
    amount: row.amount_tiyin,
    // Zero is what the panel already reads as "closed", so a settled complaint
    // and one whose clock ran out land in the same place — which is where they
    // belong, because neither is waiting on the restaurant any more.
    hoursLeft: row.hours_left ?? 0,
    title: words(row.kind),
    body: words(row.body ?? ''),
    who: '—',
    initials: '··',
    quote: words(row.body ?? ''),
    split: words(''),
    ...(row.state === 'accepted'
      ? { resolved: 'accepted' as const }
      : row.state === 'contested'
        ? { resolved: 'contested' as const }
        : {}),
  };
}

/**
 * The ninety-second queue.
 *
 * `status=new` by default, because that is the screen a merchant opens the
 * panel to see. The fixture is returned whenever the API cannot answer — and
 * an empty live queue is NOT the fixture: no new orders is the normal state of
 * a restaurant at four in the afternoon, and filling that screen with six
 * invented ones would have somebody cooking.
 */
export async function getMerchantQueue(
  status: 'new' | 'active' | 'done' | 'all' = 'new',
): Promise<{ orders: readonly MerchantQueueOrder[]; live: boolean }> {
  const answer = await apiGet<{ data: ApiMerchantOrder[] }>(
    `/marketplace/orders?status=${status}&per_page=50`,
  );

  if (!answer?.data) return { orders: MERCHANT_ORDERS, live: false };

  return { orders: answer.data.map(queueFrom), live: true };
}

/** What is in the shop window, and what it costs there. */
export async function getMerchantCatalogue(): Promise<{
  dishes: readonly CatalogueDish[];
  categories: readonly CatalogueCategory[];
  commissionPercent: number;
  live: boolean;
}> {
  const answer = await apiGet<{
    data: ApiCatalogueRow[];
    meta?: { commission_percent?: number };
  }>('/marketplace/catalogue');

  /*
   * The fixture only when the API did not answer. An empty live catalogue is a
   * real state — a restaurant that joined the marketplace and has listed
   * nothing — and it used to be filled with the design's dishes plus a nine
   * per cent commission nobody had agreed to. A merchant looking at their own
   * shop window has to see their own shop window, empty or not.
   */
  if (!answer?.data) {
    return {
      dishes: MERCHANT_DISHES,
      categories: CATALOGUE_CATEGORIES,
      commissionPercent: 9,
      live: false,
    };
  }

  /*
   * Chips numbered from 1, because 0 is "all" — `CATALOGUE_CATEGORIES` reserves
   * it and the board's filter reads `category === 0` as "no filter". Numbered
   * in the order the sections arrive, which is the catalogue's own `sort_order`,
   * so the chips read the way the menu does.
   */
  const chips = new Map<string, number>();

  for (const row of answer.data) {
    if (!chips.has(row.section)) chips.set(row.section, chips.size + 1);
  }

  return {
    dishes: answer.data.map((row) => catalogueFrom(row, chips.get(row.section) ?? 0)),
    categories: [
      { key: 0, label: { uz: 'Barchasi', ru: 'Все', en: 'All' } },
      ...[...chips.entries()].map(([section, key]) => ({
        // The section's own name, already in the reader's language — the API
        // resolved the catalogue's jsonb column against `Accept-Language`, so
        // there is no second translation to invent here.
        key,
        label: { uz: section, ru: section, en: section },
      })),
    ],
    /* Zero rather than nine when the endpoint did not say: a commission is a
       term of a contract, and a rate this console invented is a rate the
       merchant will hold somebody to. The board hides the line when it is 0. */
    commissionPercent: answer.meta?.commission_percent ?? 0,
    live: true,
  };
}

/** Issued statements, newest first, plus the week still running. */
export async function getMerchantSettlements(): Promise<{
  rows: readonly SettlementRow[];
  pending: { orders: number; gross: number; commission: number; payable: number } | null;
  live: boolean;
}> {
  const answer = await apiGet<{
    data: ApiSettlement[];
    meta?: {
      pending?: {
        orders_count: number;
        gross_tiyin: number;
        commission_tiyin: number;
        payable_tiyin: number;
      };
    };
  }>('/marketplace/settlements');

  if (!answer?.data) return { rows: SETTLEMENT_HISTORY, pending: null, live: false };

  const pending = answer.meta?.pending;

  return {
    // Never the fixture on a live answer. This screen is where a merchant
    // checks they were paid; issued statements with gross, commission and
    // payable amounts on it are money history, and a specimen flagged `live`
    // is the one thing that must never appear here. An empty table is the
    // truthful answer for a restaurant that joined last week.
    rows: answer.data.map(settlementFrom),
    pending:
      pending === undefined
        ? null
        : {
            orders: pending.orders_count,
            gross: pending.gross_tiyin,
            commission: pending.commission_tiyin,
            payable: pending.payable_tiyin,
          },
    live: true,
  };
}

/** `GET /api/v1/marketplace/settings` — the storefront row, plus two fields the
    public card omits. */
type ApiStoreSettings = {
  name: string;
  cuisine: string | null;
  delivery_fee_tiyin: number;
  min_order_tiyin: number;
  minutes_from: number | null;
  minutes_to: number | null;
  status: string;
  commission_percent: number;
};

export type MerchantSettings = {
  name: string;
  cuisine: string | null;
  deliveryFee: number;
  minOrder: number;
  minutesFrom: number | null;
  minutesTo: number | null;
  status: string;
  commissionPercent: number;
};

/**
 * This merchant's own configuration, as far as the platform actually holds it.
 *
 * The settings screen rendered `merchant-copy.ts` — the design's transcription
 * — as if it were the seller's own: "4 dan 12 ta" photos, a 5 km radius, a 9%
 * commission and a contract numbered `MP-2026-0412`. Two of those decide what a
 * restaurant gets paid, and a merchant reading them was reading somebody else's
 * agreement.
 *
 * Eight fields come back. Everything else the design draws — photo counts,
 * opening hours per day, the last-order lead, the courier type, the delivery
 * radius, the payout period, the contract number — has no column anywhere, so
 * the panel renders those unset rather than filled in.
 */
export async function getMerchantSettings(): Promise<MerchantSettings | null> {
  const answer = await apiGet<{ data: ApiStoreSettings }>('/marketplace/settings');

  if (!answer?.data) return null;

  const row = answer.data;

  return {
    name: row.name,
    cuisine: row.cuisine,
    deliveryFee: row.delivery_fee_tiyin,
    minOrder: row.min_order_tiyin,
    minutesFrom: row.minutes_from,
    minutesTo: row.minutes_to,
    status: row.status,
    commissionPercent: row.commission_percent,
  };
}

/** Complaints, open ones first and by deadline. */
export async function getMerchantDisputes(): Promise<{
  disputes: readonly Dispute[];
  live: boolean;
}> {
  const answer = await apiGet<{ data: ApiDispute[] }>('/marketplace/disputes');

  if (!answer?.data) return { disputes: DISPUTES, live: false };

  return { disputes: answer.data.map(disputeFrom), live: true };
}

/** The three numbers the platform judges a restaurant by. */
export async function getMerchantPerformance(): Promise<MerchantPerformance | null> {
  const answer = await apiGet<{
    data: {
      window_days: number;
      orders: number;
      accept_seconds: number | null;
      reject_rate_bp: number;
      cancel_rate_bp: number;
      rating: number;
      reviews_count: number;
      accept_seconds_allowed: number;
    };
  }>('/marketplace/performance');

  if (answer?.data === undefined) return null;

  return {
    windowDays: answer.data.window_days,
    orders: answer.data.orders,
    acceptSeconds: answer.data.accept_seconds,
    rejectRateBp: answer.data.reject_rate_bp,
    cancelRateBp: answer.data.cancel_rate_bp,
    rating: answer.data.rating,
    reviewsCount: answer.data.reviews_count,
    acceptSecondsAllowed: answer.data.accept_seconds_allowed,
    live: true,
  };
}

/* ======================================================== promotions & ads */

/** `GET /api/v1/marketplace/promotions` — one offer, in any of its five states. */
type ApiPromotion = {
  id: number;
  code: string;
  title: Trilingual;
  body: Trilingual | null;
  kind: string;
  state: string;
  discount_tiyin: number;
  budget_tiyin: number;
  spent_tiyin: number;
  remaining_tiyin: number;
  starts_on: string;
  ends_on: string | null;
};

/**
 * The five the API tracks are the five the panel draws, and that is checked
 * rather than assumed.
 *
 * `Promotion::STATES` and `PromotionState` happen to agree today. Written out
 * so a sixth server state lands somewhere a person looks instead of silently
 * becoming `running` — which on this card would draw a pause button on an offer
 * that has already ended, and a merchant pressing it would get a 409 they had
 * no way to predict.
 */
const PROMO_STATE: Readonly<Record<string, PromotionState>> = {
  running: 'running',
  scheduled: 'scheduled',
  ended: 'ended',
  paused: 'paused',
  cancelled: 'cancelled',
};

/**
 * An offer, plus the three figures the board needs to argue about it.
 *
 * `Promotion` is the design's shape and carries `stats` as rendered strings,
 * because the fixture's three cells differ per card — views and uses on one,
 * new guests and returns on another. The live money rides alongside as
 * integers: the budget sheet does arithmetic with it, and re-parsing "840 000"
 * out of a formatted string is how a currency separator becomes a rounding bug.
 */
export type MerchantPromotion = Promotion & {
  /** Tiyin: the ceiling, what has been paid out of it, and what is left. */
  budget: number;
  spent: number;
  remaining: number;
  /**
   * What kind of offer it is, and what it takes off — `Promotion::KINDS`.
   *
   * Carried because "Yana ishga tushirish" on a finished card is a CREATE: the
   * module has no duplicate endpoint, so the new draft is assembled from the
   * old offer's own fields client-side. Absent on the design's sample cards,
   * which is what tells the board there is nothing real to copy.
   */
  kind?: string;
  discount?: number;
};

export function promotionFrom(row: ApiPromotion): MerchantPromotion {
  const words = (text: string): Trilingual => ({ uz: text, ru: text, en: text });
  const money = (tiyin: number): Trilingual =>
    words(new Intl.NumberFormat('uz-UZ').format(tiyin / 100));

  return {
    id: String(row.id),
    state: PROMO_STATE[row.state] ?? 'scheduled',
    // Both dates, because the window is what decides which buttons the card
    // offers — an offer with no end is one nobody thought to stop.
    window: words(row.ends_on === null ? row.starts_on : `${row.starts_on} – ${row.ends_on}`),
    title: row.title,
    body: row.body ?? words(''),
    /*
     * Spent, left, ceiling — in that order, because that is the order the
     * question is asked in: what has this cost me, can I still afford it, and
     * what did I agree to. The fixture's own three labels are per-card
     * inventions and cannot be reused for a real offer.
     */
    stats: [
      { label: PROMO_TEXT.spent, value: money(row.spent_tiyin) },
      { label: PROMO_TEXT.statLeft, value: money(row.remaining_tiyin) },
      { label: PROMO_TEXT.statBudget, value: money(row.budget_tiyin) },
    ],
    budget: row.budget_tiyin,
    spent: row.spent_tiyin,
    remaining: row.remaining_tiyin,
    kind: row.kind,
    discount: row.discount_tiyin,
  };
}

/**
 * The offers this restaurant is running.
 *
 * The fixture only when the API did not answer. An empty list used to draw the
 * design's three specimen campaigns with a budget figure on them — on the one
 * screen whose controls spend money. The three states are worth teaching, but
 * copy can teach them; inventing a running campaign with a budget cannot.
 */
export async function getMerchantPromotions(): Promise<{
  promotions: readonly MerchantPromotion[];
  live: boolean;
}> {
  const answer = await apiGet<{ data: ApiPromotion[] }>('/marketplace/promotions');

  if (!answer?.data) {
    /*
     * The design's three cards, given the budget the design's own sheet opens
     * with. Zeroes would be worse than an invented figure here: the budget
     * sheet divides by the per-order share to say what a campaign buys, and a
     * specimen that answers "covers 0 orders" teaches the wrong thing about
     * the one control on this screen that spends money. Reached only when the
     * API is unreachable, which the `live: false` flag makes the board say.
     */
    const specimen = PROMOTIONS.map((promo) => ({
      ...promo,
      budget: PROMO_BUDGET.initial,
      spent: 0,
      remaining: PROMO_BUDGET.initial,
    }));

    return { promotions: specimen, live: false };
  }

  return { promotions: answer.data.map(promotionFrom), live: true };
}

/* ------------------------------------------------------------ paid placement */

/** The two positions the platform sells. */
export type PlacementSlotKey = 'home_top' | 'category_top';

/** `GET /api/v1/marketplace/placements` — a booking this merchant holds. */
type ApiPlacement = {
  id: number;
  slot: string;
  starts_on: string;
  ends_on: string;
  days: number;
  day_rate_tiyin: number;
  total_tiyin: number;
  billed_tiyin: number;
  state: string;
  queue_position: number;
};

/**
 * `meta.slots` — the rate card, and how long each position is sold out for.
 *
 * Every field but `slot` is optional here because the queue is the part that
 * moves: a slot free today carries no `queue_days` at all, and a reader that
 * required one would fall back to the fixture on the ordinary case.
 */
type ApiSlotOffer = {
  slot: string;
  day_rate_tiyin?: number;
  queue_days?: number;
};

/**
 * One row of the ad shop, ready to draw.
 *
 * The words are the design's own — `AD_SLOTS` — matched to the API's slot names
 * rather than re-translated: "in the first three of your cuisine" IS
 * `category_top`, and a second copy of that sentence would drift from the
 * first the next time either changed.
 */
export type PlacementSlotView = {
  slot: PlacementSlotKey;
  label: Trilingual;
  note: Trilingual;
  /** Tiyin, per day. */
  price: number;
  /** Days until the position frees. Zero means it starts tomorrow. */
  wait: number;
  /** This merchant's own booking on it, when they hold one. */
  booking: { id: number; days: number; total: number; startsOn: string } | null;
};

/**
 * The design's three rows, keyed by the API's two slot names.
 *
 * `banner` has no counterpart and is deliberately absent: the platform sells
 * two positions, and drawing a third live row would be a button that answers
 * `invalid_slot` to the one merchant who pressed it. It stays in the fixture,
 * where the card is a specimen rather than a shop.
 */
const SLOT_COPY: Readonly<
  Record<PlacementSlotKey, { label: Trilingual; note: Trilingual; price: number }>
> = {
  category_top: {
    label: AD_SLOTS[0]!.label,
    note: AD_SLOTS[0]!.note,
    price: AD_SLOTS[0]!.price,
  },
  home_top: {
    label: AD_SLOTS[1]!.label,
    note: AD_SLOTS[1]!.note,
    price: AD_SLOTS[1]!.price,
  },
};

const isSlot = (value: string): value is PlacementSlotKey =>
  value === 'home_top' || value === 'category_top';

/**
 * The rate card, with this merchant's own bookings folded onto it.
 *
 * The queue counter comes from the server rather than from `AD_SLOTS.wait`,
 * which is a number the design drew. A merchant told "four days" by a constant
 * plans a promotion around a date nobody is holding for them.
 */
export function placementsFrom(
  offers: readonly ApiSlotOffer[],
  bookings: readonly ApiPlacement[],
): readonly PlacementSlotView[] {
  const views: PlacementSlotView[] = [];

  for (const offer of offers) {
    if (!isSlot(offer.slot)) continue;

    const copy = SLOT_COPY[offer.slot];

    /*
     * Only a booking that is still worth releasing. A finished or cancelled row
     * is history, and treating one as current would draw "Booked" on a slot the
     * merchant could buy again — with a release button that answers 409.
     */
    const mine = bookings.find(
      (row) => row.slot === offer.slot && (row.state === 'booked' || row.state === 'running'),
    );

    views.push({
      slot: offer.slot,
      label: copy.label,
      note: copy.note,
      price: offer.day_rate_tiyin ?? copy.price,
      wait: offer.queue_days ?? 0,
      booking:
        mine === undefined
          ? null
          : { id: mine.id, days: mine.days, total: mine.total_tiyin, startsOn: mine.starts_on },
    });
  }

  return views;
}

/**
 * What is on sale, and what this restaurant already holds.
 *
 * `null` slots mean the card draws the design's three specimen rows: no rate
 * card is worse than a stale one, because a merchant reading invented prices
 * budgets against them.
 */
export async function getMerchantPlacements(): Promise<{
  slots: readonly PlacementSlotView[] | null;
  live: boolean;
}> {
  const answer = await apiGet<{ data: ApiPlacement[]; meta?: { slots?: ApiSlotOffer[] } }>(
    '/marketplace/placements',
  );

  const offers = answer?.meta?.slots;

  if (!answer?.data || offers === undefined) return { slots: null, live: false };

  const slots = placementsFrom(offers, answer.data);

  return slots.length === 0 ? { slots: null, live: false } : { slots, live: true };
}

/* ------------------------------------------------------------------ payout */

/** `GET /api/v1/marketplace/settings/payout`. */
type ApiPayout = {
  bank_name: string | null;
  mfo: string | null;
  account: string | null;
  account_last4: string | null;
  inn: string | null;
  holder: string | null;
  state: string;
  verified_at: string | null;
};

/**
 * Where the week's takings land, and whether the platform believes it.
 *
 * `accountLast4` rather than the account: twenty digits identifying where a
 * business's money goes do not need to be on a screen anybody can read over a
 * shoulder, and the four that let a merchant recognise their own account are
 * enough for the only question this card answers.
 */
export type MerchantPayout = {
  bankName: string;
  mfo: string;
  accountLast4: string;
  inn: string;
  holder: string;
  state: 'incomplete' | 'pending_review' | 'verified';
  live: true;
};

const PAYOUT_STATE: Readonly<Record<string, MerchantPayout['state']>> = {
  incomplete: 'incomplete',
  pending_review: 'pending_review',
  verified: 'verified',
};

export function payoutFrom(row: ApiPayout): MerchantPayout {
  return {
    bankName: row.bank_name ?? '—',
    mfo: row.mfo ?? '—',
    accountLast4: row.account_last4 ?? '',
    inn: row.inn ?? '—',
    holder: row.holder ?? '—',
    /*
     * Anything unrecognised is `incomplete`, which is the safe direction: a
     * merchant told their details are still being checked rings the platform,
     * and one told they are verified waits for a Thursday that does not come.
     */
    state: PAYOUT_STATE[row.state] ?? 'incomplete',
    live: true,
  };
}

/** `null` when the API cannot answer — the card then draws the design's row. */
export async function getMerchantPayout(): Promise<MerchantPayout | null> {
  const answer = await apiGet<{ data: ApiPayout }>('/marketplace/settings/payout');

  return answer?.data === undefined ? null : payoutFrom(answer.data);
}
