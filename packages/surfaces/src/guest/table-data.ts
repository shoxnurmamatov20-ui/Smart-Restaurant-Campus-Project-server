import type { Translated } from './menu-data';

/**
 * What a table owes and what its kitchen is doing — fixtures, and stated as such.
 *
 * There is no endpoint behind any of this. The platform publishes
 * `GET /api/v1/public/menu` and nothing else: no route reports a table's open
 * bill, no route reports where its order is on the ladder, and no route takes a
 * guest's payment. So the three screens after the menu are drawn against the
 * figures here and each one says `Namoyish rejimi` on it — the phrase the copy
 * catalogue was written with, because the designer expected exactly this.
 *
 * **The shape is the point.** These types are the shape the endpoints will
 * answer in, taken from what the server already models: `orders.state` for the
 * ladder, `order_items` for the lines, `BillTotals` for the money. When the
 * routes land, `guest-table-server.ts` fills these same structures and no screen
 * changes — the same split `tables-data.ts` and `tables-server.ts` already use,
 * and the reason this file imports nothing from `next/headers`.
 *
 * Money is tiyin throughout, VAT already inside every price — DECISIONS Q1.
 */

/**
 * The kitchen's five rungs, as a guest is shown them.
 *
 * Not `orders.state` verbatim: the server's ladder has thirteen states and most
 * of them are the till's business — `void`, `comped`, `refunded`. A guest sees
 * the five that describe food moving, and the mapping happens where the endpoint
 * is written rather than in a screen.
 */
export type TableStep = 'sent' | 'accepted' | 'cooking' | 'ready' | 'served';

export const TABLE_LADDER: readonly TableStep[] = [
  'sent',
  'accepted',
  'cooking',
  'ready',
  'served',
];

export type TableLine = {
  id: string;
  /** Snapshot, not a menu id: a bill records what was charged, not what is sold. */
  name: Translated;
  quantity: number;
  /** Tiyin, per one, as charged. Never re-read from the current menu. */
  price: number;
  /** How far this particular line has got. A table's lines diverge. */
  step: TableStep;
  /**
   * The options chosen on this line — "katta", "achchiq", "qo'shimcha pishloq".
   *
   * Empty when none were. The endpoint has always sent them; the mapper dropped
   * them, so a guest could not check the bill against what they asked for.
   */
  options: readonly string[];
  /** The kitchen note, if there was one. Empty otherwise. */
  note: string;
};

export type TableOrder = {
  number: string;
  table: string;
  guests: number;
  waiter: string;
  lines: readonly TableLine[];
  /** Minutes the kitchen quoted, as the design words it — "taxminan 18". */
  etaMinutes: number;
  /** Wall clock the kitchen expects to be done, `HH:MM`. */
  readyBy: string;
  /**
   * When each rung was reached, `HH:MM`, or `null` for one that has not been.
   *
   * `Mehmon.dc.html:619-625` prints a clock beside every step and the word
   * "pending" beside the ones still to come. The ladder was drawn without
   * either, which turns a timeline into five words: a guest can see that the
   * kitchen accepted the order and not that it did so twenty minutes ago.
   */
  reachedAt: Readonly<Record<TableStep, string | null>>;
};

/**
 * One table mid-meal: two courses in, tea still coming.
 *
 * Deliberately not all one state. A table whose every line says "cooking" is a
 * screen that never taught anybody what the ladder is for — the interesting
 * case, and the common one, is the guest asking why the tea has not arrived when
 * the plov has.
 */
export const TABLE_ORDER: TableOrder = {
  number: '318',
  table: '12',
  guests: 4,
  waiter: 'Sardor',
  etaMinutes: 18,
  readyBy: '19:42',
  reachedAt: {
    sent: '19:14',
    accepted: '19:15',
    cooking: '19:18',
    ready: null,
    served: null,
  },
  lines: [
    {
      id: 'l1',
      name: { uz: "Osh (to'y oshi)", ru: 'Плов (свадебный)', en: 'Plov (wedding)' },
      quantity: 2,
      price: 4_800_000,
      step: 'served',
      options: [],
      note: '',
    },
    {
      id: 'l2',
      name: { uz: 'Achchiq-chuchuk', ru: 'Ачик-чучук', en: 'Achichuk salad' },
      quantity: 1,
      price: 1_800_000,
      step: 'served',
      options: [],
      note: '',
    },
    {
      id: 'l3',
      name: { uz: 'Qo‘y shashlik', ru: 'Шашлык из баранины', en: 'Lamb shashlik' },
      quantity: 3,
      price: 3_500_000,
      step: 'cooking',
      options: [],
      note: '',
    },
    {
      id: 'l4',
      name: { uz: 'Ko‘k choy', ru: 'Зелёный чай', en: 'Green tea' },
      quantity: 2,
      price: 800_000,
      step: 'accepted',
      options: [],
      note: '',
    },
  ],
};

/**
 * The Wi-Fi network the table card names — `Mehmon.dc.html:135`.
 *
 * A fixture, and one of the few on this surface that is *not* waiting on an
 * endpoint: the network name is a property of the room, not of the platform,
 * and it belongs beside the branch record the day `GET /api/v1/public/branches`
 * exists. Until then it is one string in one place rather than typed into the
 * one screen that prints it.
 */
export const WIFI_NETWORK = 'OshXona_Guest';

/**
 * The loyalty discount a guest may hold, as a percentage.
 *
 * A card is recognised by phone number — `people.phone_e164`, the platform's
 * only identity key — and the bill screen lets it be toggled off, because a
 * guest paying for a table of colleagues often does not want to spend their own
 * discount on it.
 */
export const GOLD_CARD_PERCENT = 5;

/**
 * How many ways a bill may be split — `Mehmon.dc.html:585,1005-1006`.
 *
 * Two to twelve, opening at four. Four because that is the table this screen is
 * built for: a bill split "two ways" by default is a stepper somebody has to
 * press twice before it says anything about the table they are actually at.
 * Twelve because the design's own ceiling is twelve, and a table of thirteen
 * settles up at the till.
 */
export const SPLIT_RANGE = { min: 2, max: 12, start: 4 } as const;

/**
 * The four modifiers the dish sheet offers when the kitchen offers none —
 * `Mehmon.dc.html:826-831`.
 *
 * Prices are tiyin. The last one is free and prints an em dash rather than
 * `+0`, which is the design's own treatment: "no tail fat" is an instruction to
 * the kitchen, not a thing to buy.
 *
 * ---------------------------------------------------------------------------
 * These are the fallback now, not the sheet
 *
 * This surface argued for a long time that it should draw no add-on group at
 * all, on the grounds that a guest choosing an option the kitchen never priced
 * is quoted one number and billed another, at the table, on a phone the
 * restaurant handed them. That argument was right about the risk, and the
 * remedy has arrived rather than the risk being accepted: `GET
 * /api/v1/public/menu` eager-loads `modifier_groups` per dish — it always has —
 * and `guest/menu-data.ts` now maps them onto `GuestDish.groups`, so both guest
 * clients draw the kitchen's own options with the kitchen's own ids. Those ids
 * are what `POST /public/tables/{table}/order` prices through `MenuCatalog`,
 * and the four keys below are words it would refuse.
 *
 * So they survive for exactly one case: a dish the kitchen asks nothing about,
 * where `groups` is undefined and the design still draws a group. What is
 * chosen from them cannot be priced — there is no catalogue row to price it
 * against — so it travels as words in the line's note instead, and the kitchen
 * hears "qazi qo'shing" even though the bill will not carry it. That is the
 * honest shape of the gap: the guest is quoted the design's figure and billed
 * the catalogue's, which is in their favour, and a restaurant that wants to
 * charge for qazi adds a modifier group to the dish and this fallback stops
 * being drawn for it.
 */
export type DishAddon = {
  key: 'meat' | 'qazi' | 'egg' | 'noFat';
  /** Tiyin, added once to the unit price. Zero is a kitchen instruction. */
  price: number;
};

export const DISH_ADDONS: readonly DishAddon[] = [
  { key: 'meat', price: 1_800_000 },
  { key: 'qazi', price: 2_200_000 },
  { key: 'egg', price: 600_000 },
  { key: 'noFat', price: 0 },
];

/** What one line comes to, tiyin. */
export function lineTotal(line: TableLine): number {
  return line.price * line.quantity;
}

/** The food, before service, discount or tax extraction. Tiyin. */
export function orderSubtotal(order: TableOrder): number {
  return order.lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

/** How many plates, which is what the guest counts — not how many rows. */
export function orderCount(order: TableOrder): number {
  return order.lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** How far the slowest line has got — the table's own position on the ladder. */
export function orderStep(order: TableOrder): TableStep {
  return order.lines.reduce<TableStep>((slowest, line) => {
    return TABLE_LADDER.indexOf(line.step) < TABLE_LADDER.indexOf(slowest) ? line.step : slowest;
  }, 'served');
}

/**
 * The payment rails a table is offered, in the order the market uses them.
 *
 * `sub` names which catalogue line describes the rail — `Mehmon.dc.html:876-881`
 * gives every one of them a second line, and the bill drew four names with
 * nothing under them, so `Click` and `Payme` read as two spellings of the same
 * thing. `schemes` is the card row's own line: identical in three languages, so
 * it is data rather than copy.
 */
export const TABLE_RAILS: readonly {
  id: string;
  label: string;
  isCash: boolean;
  /** Which `qr.bill.rail*` line sits under the name, or `schemes` for the card. */
  sub: 'schemes' | 'app' | 'waiter';
}[] = [
  { id: 'card', label: 'Karta', isCash: false, sub: 'schemes' },
  { id: 'click', label: 'Click', isCash: false, sub: 'app' },
  { id: 'payme', label: 'Payme', isCash: false, sub: 'app' },
  { id: 'cash', label: 'Naqd', isCash: true, sub: 'waiter' },
];

/** What the card rail accepts. The same three words in all three languages. */
export const CARD_SCHEMES = 'Uzcard, Humo, Visa';

/** The tip chips, as percentages of the food line. */
export const TABLE_TIPS: readonly number[] = [0, 5, 10, 15];

/**
 * A rail's name.
 *
 * No locale parameter, because a rail is a company: Click is Click in all three
 * languages, and `Naqd` is data the catalogue would reject — `i18n.test.ts`
 * refuses a key whose three values match. If a rail ever needs translating the
 * label becomes a `Translated` on the record itself, not a second argument here.
 */
export function railLabel(id: string): string {
  return TABLE_RAILS.find((rail) => rail.id === id)?.label ?? id;
}
