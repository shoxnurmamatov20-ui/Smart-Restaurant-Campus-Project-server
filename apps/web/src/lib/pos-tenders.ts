/**
 * The payment vocabulary, client-safe.
 *
 * Its own module and not part of ./pos-session.ts, for the reason CLAUDE.md
 * records about `tables-data.ts`: that module reads `next/headers`, so anything a
 * client component imports from it drags a server-only API into the browser
 * bundle and the build fails. A *type* is fine — it is erased — but these are
 * runtime values the payment sheet renders.
 *
 * The rule, restated because it is easy to trip over twice: types and constants
 * live where a client component can reach them; anything that talks to the server
 * lives in the module only server components import.
 */

/**
 * What to ask the guest for, as the server computed it.
 *
 * `cash_total` is the bill rounded to notes a drawer can actually pay out
 * (DECISIONS Q7) and `cash_rounding` is the signed difference, carried separately
 * because "45 240 emas, 45 000" needs a visible reason on the screen — otherwise it
 * reads as the till having got the bill wrong.
 *
 * Every figure comes down from the API. The screen displays them and never derives
 * one: a client that could compute a total could disagree with the receipt, and the
 * disagreement would surface in front of a guest with money already on the counter.
 */
export type PosPayable = {
  total: number;
  cash_total: number;
  /** Signed — rounding goes both ways. */
  cash_rounding: number;
  cash_rounding_step: number;
};

/**
 * How money can arrive.
 *
 * The card schemes are listed individually because they cost the restaurant
 * different amounts — Uzcard and Humo 1.2%, Visa and Mastercard 2.4% — and a
 * single "card" button would make an owner's card revenue impossible to reconcile
 * against a bank statement. The order is the order a cashier reaches for them in:
 * cash first, then the two local schemes that carry most of the traffic.
 *
 * `drawer` says whether this method puts notes in the box, which is what decides
 * where change can come from and what a shift's expected cash includes.
 *
 * **A brand is not copy.** "Uzcard" is Uzcard in Uzbek, Russian and English, so it
 * is carried here as data rather than as three identical catalogue entries — the
 * rule `i18n.test.ts` enforces, and it enforces it because a key whose three values
 * are the same is a key nobody will remember to change when the brand renames, in
 * three places, two of which nobody will find. `label` is set only where the word
 * genuinely differs: cash and a company account.
 */
export const POS_TENDER_METHODS = [
  { id: 'cash', label: 'methodCash', brand: null, drawer: true },
  { id: 'uzcard', label: null, brand: 'Uzcard', drawer: false },
  { id: 'humo', label: null, brand: 'Humo', drawer: false },
  { id: 'visa', label: null, brand: 'Visa', drawer: false },
  { id: 'mastercard', label: null, brand: 'Mastercard', drawer: false },
  { id: 'click', label: null, brand: 'Click', drawer: false },
  { id: 'payme', label: null, brand: 'Payme', drawer: false },
  { id: 'uzum', label: null, brand: 'Uzum', drawer: false },
  { id: 'corporate', label: 'methodCorporate', brand: null, drawer: false },
  /*
   * A guest's own tab — P13, `Payment::METHODS` has carried it since.
   *
   * Not the same as `corporate`, which looks similar and is not: a company
   * account is a contract with a business that settles by bank transfer, and the
   * money does arrive. `credit` is a regular signing for lunch, and the money is
   * a debt until they come back on Friday. Last in the list because it is the
   * least-reached-for and because it is the only one that needs a customer on
   * the bill before it can be pressed.
   */
  { id: 'credit', label: 'methodCredit', brand: null, drawer: false },
] as const;

export type PosTenderMethod = (typeof POS_TENDER_METHODS)[number]['id'];
