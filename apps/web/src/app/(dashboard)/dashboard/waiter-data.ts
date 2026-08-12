import type { OrderStatus } from './overview-data';

/**
 * The waiter's shift screen.
 *
 * Scoped to one person, not one branch: every figure is *theirs*. That is the
 * design's intent for this role and it is also the safer default — a waiter who
 * can read the branch's takings can work out a colleague's.
 *
 * The screen exists to get them onto the floor, which is why the largest thing
 * on it is a button rather than a chart.
 */

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

/** The five states a table can be in. The design's §3.5, in order of urgency. */
export type TableStatus = 'toPay' | 'seated' | 'reserved' | 'cleaning' | 'free';

export type MyTable = {
  id: string;
  /** The number painted on the table. A label, not an index. */
  number: string;
  zone: 'main' | 'terrace' | 'vip';
  seats: number;
  status: TableStatus;
  /** How long it has been occupied, `null` when it is not. */
  since: string | null;
  /** The running bill in tiyin, `null` when there is no open ticket. */
  bill: number | null;
  guests: number | null;
};

export type MyOrder = {
  id: string;
  table: string;
  status: OrderStatus;
  items: number;
  total: number;
  /** Minutes since it was fired. Drives nothing but the reader's judgement. */
  minutesAgo: number;
};

export type MySeller = {
  id: string;
  /** A dish name is a proper noun; it is not translated. */
  name: string;
  units: number;
  share: number;
};

export type WaiterOverview = {
  greetingName: string;
  myOrders: number;
  openOrders: number;
  covers: number;
  sales: number;
  averageTicket: number;
  tables: readonly MyTable[];
  orders: readonly MyOrder[];
  topSellers: readonly MySeller[];
};

const PLACEHOLDER: WaiterOverview = {
  greetingName: 'Jasur',
  myOrders: 14,
  openOrders: 4,
  covers: 41,
  sales: som(1_842_000),
  averageTicket: som(131_571),

  tables: [
    {
      id: 't7',
      number: '7',
      zone: 'main',
      seats: 4,
      status: 'toPay',
      since: '10:44',
      bill: som(318_000),
      guests: 4,
    },
    {
      id: 't12',
      number: '12',
      zone: 'main',
      seats: 6,
      status: 'seated',
      since: '11:18',
      bill: som(402_000),
      guests: 5,
    },
    {
      id: 't1',
      number: '1',
      zone: 'main',
      seats: 4,
      status: 'toPay',
      since: '10:09',
      bill: som(186_000),
      guests: 3,
    },
    {
      id: 'tr6',
      number: 'T6',
      zone: 'terrace',
      seats: 4,
      status: 'seated',
      since: '10:22',
      bill: som(176_000),
      guests: 3,
    },
    {
      id: 'tr2',
      number: 'T2',
      zone: 'terrace',
      seats: 2,
      status: 'reserved',
      since: null,
      bill: null,
      guests: null,
    },
    {
      id: 't4',
      number: '4',
      zone: 'main',
      seats: 4,
      status: 'free',
      since: null,
      bill: null,
      guests: null,
    },
  ],

  orders: [
    { id: 'A-1291', table: '12', status: 'cooking', items: 9, total: som(402_000), minutesAgo: 6 },
    { id: 'A-1285', table: 'T6', status: 'ready', items: 7, total: som(176_000), minutesAgo: 12 },
    { id: 'A-1288', table: '7', status: 'to_pay', items: 8, total: som(318_000), minutesAgo: 26 },
    { id: 'A-1284', table: '1', status: 'to_pay', items: 6, total: som(186_000), minutesAgo: 41 },
  ],

  topSellers: [
    { id: 'osh', name: 'Osh, beef', units: 11, share: 1 },
    { id: 'shashlik', name: 'Shashlik, lamb', units: 8, share: 0.73 },
    { id: 'lagmon', name: "Lag'mon", units: 6, share: 0.55 },
    { id: 'ayron', name: 'Ayron', units: 5, share: 0.45 },
  ],
};

/** TODO(api): GET /api/v1/orders/my-shift — scoped to the signed-in waiter. */
export async function getWaiterOverview(): Promise<WaiterOverview> {
  return PLACEHOLDER;
}
