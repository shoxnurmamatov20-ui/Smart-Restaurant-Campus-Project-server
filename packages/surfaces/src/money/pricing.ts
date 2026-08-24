/**
 * What a guest's basket adds up to — the browser's copy of the server's rule.
 *
 * **This is a stand-in, and it is the only one.** Money is the server's to
 * decide: `app/Support/Orders/BillTotals.php` is the calculator a receipt, a
 * fiscal driver, a Z report and a dispute all read from, and a second
 * arithmetic is exactly how a guest ends up seeing one total on their phone and
 * a different one on the printed cheque. The guest surfaces compute here only
 * because the endpoint that would answer for them does not exist yet: the
 * platform publishes `GET /api/v1/public/menu` and nothing else, so there is no
 * `POST /api/v1/public/orders` to quote a total back.
 *
 * So this module mirrors `BillTotals::of()` line for line, and it is the single
 * place that changes when the intake endpoint lands — every caller asks for
 * {@link billTotals} and none of them multiplies anything itself.
 *
 * ---------------------------------------------------------------------------
 * The rules, in the order they must be applied
 *
 *   1. The discount comes off the subtotal.
 *   2. Service is charged on **what is left**, and only on dine-in.
 *   3. VAT is **read out of** that sum, never added to it.
 *   4. The delivery fee joins last, outside the tax base.
 *
 * The order is not cosmetic. Charging service on a pre-discount subtotal
 * quietly turns a 10% discount into 9%, and adding VAT rather than extracting
 * it inflates every menu price by 12% — the first guest to add up their own
 * bill finds both.
 *
 * The rounding is not cosmetic either, and it is deliberately asymmetric:
 * service truncates (money the restaurant keeps, so down is the side that needs
 * no explanation to a guest) while VAT rounds to nearest (a statement about
 * money that already moved, which has to reconcile against the amount charged).
 * `BillTotals` explains both at length; this file copies the behaviour rather
 * than the reasoning so the two cannot drift.
 *
 * Everything is **tiyin**, integers throughout. 1 so'm = 100 tiyin. No float
 * reaches a total: a one-tiyin rounding error multiplied over a day's orders is
 * a real difference in a real till, and the cashier gets blamed for it.
 */

/** How the guest is served. The API's own values — `orders.channel` stores these. */
export type OrderChannel = 'dine_in' | 'takeaway' | 'delivery' | 'aggregator';

/** DECISIONS Q2 — dine-in pays for the table and the waiter; nothing else does. */
export function chargesService(channel: OrderChannel): boolean {
  return channel === 'dine_in';
}

/** DECISIONS Q1 — 12%, and it is already inside every price on the menu. */
export const VAT_PERCENT = 12;

/** DECISIONS Q2 — 10% of the discounted subtotal, dine-in only. */
export const SERVICE_PERCENT = 10;

/** DECISIONS Q7 — cash rounds to the nearest 1 000 so'm, which is 100 000 tiyin. */
export const CASH_ROUNDING_TIYIN = 100_000;

/**
 * PHP's `round()` is half-away-from-zero; JavaScript's is half-toward-positive.
 *
 * Identical for every positive amount, which is all a bill has — and different
 * the moment a refund line goes negative. Written out rather than assumed,
 * because "they agree in practice" is how the two calculators drift.
 */
function roundHalf(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** PHP's `intdiv` — truncation toward zero, not `Math.floor`. */
function intdiv(numerator: number, denominator: number): number {
  return Math.trunc(numerator / denominator);
}

/**
 * A bill, field for field with what `BillTotals::toArray()` sends.
 *
 * The same six figures in the same meaning, camel-cased: the API answers
 * `service_charge`, `delivery_fee` and `vat_included`, so the day a server quote
 * replaces this the mapping is one rename per key and no screen changes shape.
 * (An earlier note here claimed the names matched outright. They do not, and a
 * reader wiring the endpoint on that basis would find out at runtime.)
 *
 * `vatIncluded` is named for what it is: tax already inside `total`, not a line
 * added to it. A screen that renders it as “+ VAT” is wrong, and the name is
 * what says so.
 */
export type BillTotals = {
  /** Sum of the lines, tiyin. */
  subtotal: number;
  /** What came off, tiyin, as a positive number. */
  discount: number;
  /** 10% of (subtotal − discount) on dine-in, else 0. */
  serviceCharge: number;
  /** Tiyin. Outside VAT. */
  deliveryFee: number;
  /** The tax already inside `total`, tiyin. Never added to it. */
  vatIncluded: number;
  /** What the guest pays, tiyin. */
  total: number;
};

export type BillInput = {
  subtotal: number;
  channel: OrderChannel;
  discount?: number;
  deliveryFee?: number;
  servicePercent?: number;
  vatPercent?: number;
};

/** The mirror of `BillTotals::of()`. Integers in, integers out. */
export function billTotals({
  subtotal,
  channel,
  discount = 0,
  deliveryFee = 0,
  servicePercent = SERVICE_PERCENT,
  vatPercent = VAT_PERCENT,
}: BillInput): BillTotals {
  // A discount cannot exceed the food. Clamped rather than refused: by the time
  // a total is being added up, zero is the only sane answer left.
  const applied = Math.max(0, Math.min(discount, subtotal));
  const base = subtotal - applied;

  const serviceCharge =
    chargesService(channel) && servicePercent > 0 ? intdiv(base * servicePercent, 100) : 0;

  const taxable = base + serviceCharge;

  const vatIncluded = vatPercent > 0 ? roundHalf((taxable * vatPercent) / (100 + vatPercent)) : 0;

  return {
    subtotal,
    discount: applied,
    serviceCharge,
    deliveryFee,
    vatIncluded,
    total: taxable + deliveryFee,
  };
}

/**
 * A percentage of an amount, in whole tiyin.
 *
 * For the discount and the tip — the two figures a guest picks by percentage.
 * Rounds to nearest so a 5% tip on 257 070 is the same number the waiter counts
 * rather than one tiyin short of it.
 */
export function percentOf(amount: number, percent: number): number {
  return roundHalf((amount * percent) / 100);
}

/**
 * DECISIONS Q7 — what a cash payment actually hands over.
 *
 * Mathematical rounding to the nearest 1 000 so'm: 500 and up goes up. The
 * difference is a real ledger line — `Payment.rounding` — not an artefact, and
 * the shift reconciles against the rounded figure. Card, Click and Payme take
 * the exact amount and never call this.
 */
export function roundedForCash(total: number): number {
  return roundHalf(total / CASH_ROUNDING_TIYIN) * CASH_ROUNDING_TIYIN;
}

/** The difference cash rounding creates, positive when the guest pays more. */
export function cashRoundingDelta(total: number): number {
  return roundedForCash(total) - total;
}

/**
 * Splitting a bill evenly, the way the design words it.
 *
 * Each share is floored to a whole 1 000 so'm — nobody hands a friend 46 218
 * so'm — and **the remainder goes onto the first share**, which is stated on
 * screen. Distributing it as a fraction across every share would be fairer by a
 * few tiyin and unusable at a table, and hiding it would mean the shares do not
 * add up to the bill.
 */
export function splitEvenly(
  total: number,
  ways: number,
): { each: number; first: number; ways: number } {
  const parts = Math.max(2, Math.trunc(ways));
  const each = Math.floor(total / parts / CASH_ROUNDING_TIYIN) * CASH_ROUNDING_TIYIN;

  return { each, first: total - each * (parts - 1), ways: parts };
}
