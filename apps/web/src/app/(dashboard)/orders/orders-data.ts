import type { OrderStatus } from '../dashboard/overview-data';

/**
 * The order list, as the design's screen shows it.
 *
 * Figures and ids only; the column headings, tab names and status words are
 * copy and live in src/i18n. Money is integer tiyin, as everywhere else.
 *
 * Wired to `GET /api/v1/orders/orders` — see `./orders-server.ts`. The list below is what the screen draws with no session behind it.
 */

export type OrderChannel = 'dine_in' | 'delivery' | 'counter';

export type OrderRow = {
  id: string;
  /** Table name, room or aggregator — a proper noun either way. */
  where: string;
  channel: OrderChannel;
  /** Cover count for a table, or the delivery address. */
  detail: string;
  waiter: string;
  items: number;
  status: OrderStatus;
  /** When it was opened, as the till recorded it. */
  time: string;
  total: number;
};

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

/**
 * Orders for this render — the API's when there is a session.
 *
 * Declared here, above the fixtures, because the fixtures are the fallback and
 * the reader should meet the real path first. Implementation in
 * `./orders-server.ts`; the pattern is `menu/menu-server.ts`.
 */
export const ORDERS: readonly OrderRow[] = [
  {
    id: 'A-1291',
    where: 'Stol 12',
    channel: 'dine_in',
    detail: '5',
    waiter: 'Aziza R.',
    items: 9,
    status: 'cooking',
    time: '11:18',
    total: som(402_000),
  },
  {
    id: 'A-1290',
    where: 'Stol 8',
    channel: 'dine_in',
    detail: '7',
    waiter: 'Nodira S.',
    items: 14,
    status: 'ready',
    time: '11:11',
    total: som(612_000),
  },
  {
    id: 'A-1289',
    where: 'VIP 2',
    channel: 'dine_in',
    detail: '9',
    waiter: 'Nodira S.',
    items: 21,
    status: 'cooking',
    time: '10:58',
    total: som(1_240_000),
  },
  {
    id: 'A-1288',
    where: 'Stol 7',
    channel: 'dine_in',
    detail: '4',
    waiter: 'Jasur T.',
    items: 8,
    status: 'to_pay',
    time: '10:44',
    total: som(318_000),
  },
  {
    id: 'A-1287',
    where: 'Yandex Eats',
    channel: 'delivery',
    detail: 'Chilonzor 14',
    waiter: 'system',
    items: 4,
    status: 'ready',
    time: '10:39',
    total: som(128_000),
  },
  {
    id: 'A-1286',
    where: 'Olib ketish 42',
    channel: 'counter',
    detail: '',
    waiter: 'Dilshod K.',
    items: 3,
    status: 'paid',
    time: '10:31',
    total: som(74_000),
  },
  {
    id: 'A-1285',
    where: 'Terrassa 6',
    channel: 'dine_in',
    detail: '3',
    waiter: 'Jasur T.',
    items: 7,
    status: 'accepted',
    time: '10:22',
    total: som(176_000),
  },
  {
    id: 'A-1284',
    where: 'Stol 1',
    channel: 'dine_in',
    detail: '3',
    waiter: 'Aziza R.',
    items: 6,
    status: 'paid',
    time: '10:09',
    total: som(186_000),
  },
];

/**
 * The four filters above the table, and which states sit behind each.
 *
 * The counts used to be written beside them and were wrong the moment the list
 * moved — twelve "active" over a table of eight. They are derived now, from the
 * same rows the table draws, so the tab and the list cannot disagree.
 */
export const ORDER_TABS = [
  { key: 'tabActive', states: ['new', 'accepted', 'cooking', 'to_pay'] },
  { key: 'tabReady', states: ['ready'] },
  { key: 'tabPaid', states: ['paid'] },
  { key: 'tabVoided', states: [] },
] as const;

export type OrderTabKey = (typeof ORDER_TABS)[number]['key'];

export const countFor = (rows: readonly OrderRow[], tab: OrderTabKey): number =>
  rowsFor(rows, tab).length;

export function rowsFor(rows: readonly OrderRow[], tab: OrderTabKey): readonly OrderRow[] {
  const entry = ORDER_TABS.find((candidate) => candidate.key === tab);

  if (entry === undefined) return rows;

  /*
   * `voided` is not one of the thirteen states a live order can hold — a void
   * is a soft delete, and `CLAUDE.md` rule 7 says an order is never removed.
   * The tab is drawn because the design draws it and because a manager looks
   * for it; it lists nothing until the API exposes the trashed scope.
   */
  return entry.states.length === 0
    ? []
    : rows.filter((row) => (entry.states as readonly string[]).includes(row.status));
}

/**
 * How a bill is made up, for the order drawer.
 *
 * Keyed by order rather than carried on the row: the table draws forty rows and
 * needs none of this, and a list endpoint that returned every line of every
 * order would be a list endpoint nobody could page.
 *
 * The drawer reads the real ones on open — `GET /api/orders?id=`, which
 * forwards `GET /api/v1/orders/orders/{id}?include=items`. This map is what it
 * falls back to: a fixture row has no id to ask about, and an API that blinked
 * mid-service should still open a drawer with something in it.
 */
export type OrderLine = {
  id: string;
  name: string;
  quantity: number;
  /** Tiyin, per unit. */
  price: number;
  /** Where it is on the kitchen's ladder. */
  state: 'sent' | 'cooking' | 'ready' | 'served';
  /** Modifiers, already joined. Empty when there are none. */
  note?: string;
};

export const ORDER_LINES: Readonly<Record<string, readonly OrderLine[]>> = {
  'A-1291': [
    { id: 'l1', name: "Osh, to'y oshi", quantity: 3, price: som(48_000), state: 'served' },
    { id: 'l2', name: "Lag'mon, qovurma", quantity: 2, price: som(52_000), state: 'ready' },
    {
      id: 'l3',
      name: 'Achchiq-chuchuk',
      quantity: 2,
      price: som(18_000),
      state: 'cooking',
      note: 'Piyozsiz',
    },
    { id: 'l4', name: "Ko'k choy", quantity: 2, price: som(8_000), state: 'served' },
  ],
  'A-1290': [
    { id: 'l1', name: "Shashlik, qo'y", quantity: 6, price: som(46_000), state: 'ready' },
    { id: 'l2', name: 'Manti, 5 dona', quantity: 3, price: som(38_000), state: 'ready' },
    { id: 'l3', name: 'Ayron', quantity: 5, price: som(10_000), state: 'served' },
  ],
};

/** The five-step rail the drawer draws, in order. */
/**
 * What the filter panel can narrow a channel to.
 *
 * `Order::CHANNELS` on the API, in the order the console's own words read.
 * Four rather than the three the table draws — `aggregator` is folded into
 * "delivery" for display, because a guest does not care which app it came
 * through, but it is a real value to FILTER by: "show me only Yandex" is the
 * question an operator asks at seven o'clock.
 */
export const CHANNEL_FILTERS = ['dine_in', 'takeaway', 'delivery', 'aggregator'] as const;

/**
 * The states worth offering as a filter.
 *
 * Not all thirteen. `OrderState`'s ladder includes steps a bill passes through
 * in seconds (`draft`), and a picker with thirteen entries is a picker nobody
 * reads to the bottom of — the tab strip already covers the four a floor thinks
 * in. These are the ones somebody narrows a whole day by.
 */
export const STATUS_FILTERS = ['placed', 'cooking', 'ready', 'served', 'paid', 'voided'] as const;

export const ORDER_RAIL = ['new', 'accepted', 'cooking', 'ready', 'paid'] as const;

export type RailStep = (typeof ORDER_RAIL)[number];

/**
 * How far along the rail this order is.
 *
 * `to_pay` maps to `ready` rather than getting a sixth dot: the food is done
 * and the money is not, which is what the fourth step means. A rail with a step
 * for every internal state would be a rail nobody reads.
 */
export function railIndex(status: OrderStatus): number {
  if (status === 'to_pay') return ORDER_RAIL.indexOf('ready');

  const found = ORDER_RAIL.indexOf(status as RailStep);

  return found === -1 ? 0 : found;
}
