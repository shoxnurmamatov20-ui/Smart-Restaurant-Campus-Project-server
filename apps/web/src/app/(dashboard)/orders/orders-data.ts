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

/** The four filters above the table, and how many sit behind each. */
export const ORDER_TABS = [
  { key: 'tabActive', count: 12 },
  { key: 'tabReady', count: 3 },
  { key: 'tabPaid', count: 189 },
  { key: 'tabVoided', count: 2 },
] as const;
