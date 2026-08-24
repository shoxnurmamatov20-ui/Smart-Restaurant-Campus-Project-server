/**
 * The staff app's sub-screens, as structure.
 *
 * Amounts, percentages, tone names and ids — everything that reads the same in
 * all three languages, so none of it sits in `more-copy.ts` waiting for two
 * files out of three to fall behind. The two are index-aligned:
 * `MORE_RISK[2]` is `moreCopy(lang).risk[2]`, and `more-fidelity.test.ts`
 * checks it.
 *
 * Read out of `files/Smart Restaurant Xodimlar ilovasi.dc.html` in the same
 * pass as the copy.
 */

/** How loudly a figure is drawn. Never a raw colour — the palette owns those. */
export type CrewTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

/** The profit-and-loss ladder. `strong` is the design’s 700-weight row. */
export const MORE_PNL: readonly { strong: boolean; tone: CrewTone }[] = [
  { strong: false, tone: 'neutral' },
  { strong: false, tone: 'neutral' },
  { strong: true, tone: 'neutral' },
  { strong: false, tone: 'neutral' },
  { strong: false, tone: 'neutral' },
  { strong: false, tone: 'neutral' },
  { strong: true, tone: 'success' },
];

/** Six months of cash flow, as bar heights and their tone. */
export const MORE_CASH_FLOW: readonly { height: string; tone: CrewTone }[] = [
  { height: '48px', tone: 'brand' },
  { height: '56px', tone: 'brand' },
  { height: '51px', tone: 'brand' },
  { height: '69px', tone: 'brand' },
  { height: '63px', tone: 'brand' },
  { height: '76px', tone: 'brand' },
];

export const MORE_PEOPLE: readonly { top: boolean }[] = [
  { top: true },
  { top: true },
  { top: false },
  { top: false },
  { top: false },
  { top: false },
];

/** Risk by employee: the bar width and how loudly it is drawn. */
export const MORE_RISK: readonly { width: string; tone: CrewTone }[] = [
  { width: '78%', tone: 'danger' },
  { width: '52%', tone: 'warning' },
  { width: '24%', tone: 'neutral' },
  { width: '11%', tone: 'neutral' },
];

/**
 * The five steps of closing a shift.
 *
 * `done` is the design's own initial state — three of five already satisfied
 * when a manager opens the screen at eleven at night, which is what makes the
 * list worth reading rather than a form to fill in.
 */
/**
 * The five steps of closing a shift.
 *
 * `key` is what a tick is stored under — `checklist_tick` takes `{list, step}`
 * and the step has to survive a redeploy and a translation. The index would
 * not: insert a sixth step at the top and every tick recorded last month means
 * a different line.
 *
 * `done` is the fixture's opening state and is only read when the checklist
 * read did not answer. On a live handset the ticks come from
 * `GET /staff/checklists/today`, which is the whole point — a phone that sleeps
 * mid-round used to restart the list.
 */
export const MORE_CLOSING: readonly { key: string; done: boolean; actionable: boolean }[] = [
  { key: 'orders_closed', done: true, actionable: false },
  { key: 'tables_free', done: true, actionable: false },
  { key: 'fridges', done: false, actionable: true },
  { key: 'waste_logged', done: false, actionable: true },
  { key: 'handover', done: false, actionable: true },
];

export const MORE_ROTA: readonly { tone: CrewTone }[] = [
  { tone: 'success' },
  { tone: 'success' },
  { tone: 'warning' },
  { tone: 'success' },
  { tone: 'danger' },
  { tone: 'success' },
];

/** Average time per station, and how far over target it is. */
export const MORE_STATIONS: readonly { width: string; tone: CrewTone }[] = [
  { width: '74%', tone: 'danger' },
  { width: '61%', tone: 'success' },
  { width: '48%', tone: 'success' },
  { width: '44%', tone: 'success' },
];

/** Waste items priced per unit, in tiyin. */
/**
 * The five reasons, as the ledger stores them.
 *
 * Index-aligned with `moreCopy().wasteReasons`, which is the label a
 * storekeeper reads. The code is what goes on the wire, because a write-off is
 * grouped by reason on a food-cost report and a reason recorded in whatever
 * language the phone happened to be in would split one bucket into three.
 *
 * `StockLedger::writeOff` takes the reason as free text and requires one —
 * unexplained shrinkage is the thing the module exists to surface — so the
 * choice of what to put in it is the caller's, and this is it.
 */
export const WASTE_REASON_CODES = ['expired', 'spoiled', 'prep', 'returned', 'other'] as const;

export type WasteReasonCode = (typeof WASTE_REASON_CODES)[number];

/**
 * The four reasons a courier hands a bag back, as the journal stores them.
 *
 * Index-aligned with `moreCopy().handback`. Same argument as the waste codes:
 * the operator reassigning the order groups by this, and "mijoz javob bermadi"
 * and "гость не ответил" are one reason written twice.
 */
export const HANDBACK_REASON_CODES = [
  'address_wrong',
  'no_answer',
  'refused',
  'breakdown',
] as const;

export type HandbackReasonCode = (typeof HANDBACK_REASON_CODES)[number];

export const MORE_WASTE_ITEMS: readonly { id: string; unitTiyin: number }[] = [
  { id: 'w1', unitTiyin: 6200000 },
  { id: 'w2', unitTiyin: 4800000 },
  { id: 'w3', unitTiyin: 600000 },
  { id: 'w4', unitTiyin: 2100000 },
  { id: 'w5', unitTiyin: 400000 },
];

export const MORE_EXPIRY: readonly { tone: CrewTone }[] = [
  { tone: 'danger' },
  { tone: 'danger' },
  { tone: 'warning' },
  { tone: 'warning' },
  { tone: 'neutral' },
  { tone: 'neutral' },
];

/** What to reorder: unit price in tiyin, and the suggested quantity. */
export const MORE_PURCHASE: readonly { id: string; unitTiyin: number; suggested: number }[] = [
  { id: 'p1', unitTiyin: 6200000, suggested: 25 },
  { id: 'p2', unitTiyin: 4800000, suggested: 10 },
  { id: 'p3', unitTiyin: 3400000, suggested: 20 },
  { id: 'p4', unitTiyin: 600000, suggested: 30 },
  { id: 'p5', unitTiyin: 1800000, suggested: 0 },
];

export const MORE_SWAP_SHIFTS: readonly { id: string }[] = [
  { id: 'w1' },
  { id: 'w2' },
  { id: 'w3' },
];

export const MORE_SWAP_PEOPLE: readonly { id: string }[] = [
  { id: 'p1' },
  { id: 'p2' },
  { id: 'p3' },
];

/**
 * The owner's branch cards.
 *
 * `attainment` is the percentage of target the design draws as a bar; `up` is
 * whether the delta is a rise. Money stays a formatted string because the
 * design writes it in millions ("18.4 mln") and re-deriving that from tiyin
 * here would put a second formatter in the app.
 */
export const MORE_BRANCHES: readonly { attainment: number; up: boolean; tone: CrewTone }[] = [
  { attainment: 92, up: true, tone: 'success' },
  { attainment: 91, up: true, tone: 'success' },
  { attainment: 76, up: false, tone: 'danger' },
  { attainment: 90, up: true, tone: 'success' },
  { attainment: 100, up: true, tone: 'success' },
];

/** The colour of a booking's left edge — amber means unconfirmed. */
export const MORE_BOOKINGS: readonly { tone: CrewTone; hasNote: boolean }[] = [
  { tone: 'brand', hasNote: true },
  { tone: 'brand', hasNote: false },
  { tone: 'warning', hasNote: true },
  { tone: 'brand', hasNote: false },
];

/** Whether a shift KPI's delta is a good one. */
export const MORE_SHIFT_KPIS: readonly { tone: CrewTone }[] = [
  { tone: 'neutral' },
  { tone: 'success' },
  { tone: 'neutral' },
  { tone: 'neutral' },
];

/**
 * The four conditions a courier's shift ends on — `dc.html:2304`.
 *
 * Three are already satisfied and one is not, which is the design's own state
 * and the reason the screen is worth opening: what a courier wants to know at
 * the end of a shift is which single thing is still holding them up.
 */
export const MORE_END_SHIFT: readonly { key: string; done: boolean }[] = [
  /*
   * `false`, and it was `true` — the one row on this screen that is not a
   * constant. The design derives it from the drop list (`openDrops === 0`) and
   * two of the three drops are still open, so a screen that ticked it told a
   * courier every order was closed while the deliveries tab two taps away
   * showed two of them waiting. `EndShiftChecklist` re-derives it from `DROPS`;
   * this entry stays so the row keeps its place in the index-aligned copy.
   */
  { key: 'orders_closed', done: false },
  { key: 'cash_handed', done: false },
  { key: 'bag_returned', done: true },
  { key: 'scooter_parked', done: true },
];
