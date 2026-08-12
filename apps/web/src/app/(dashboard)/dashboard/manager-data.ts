import type { Messages } from '@/i18n';

/**
 * The branch manager's shift dashboard.
 *
 * Same seam as ./overview-data.ts: types are the contract, the constant is
 * scaffolding, `getManagerOverview()` becomes a fetch and the screen does not
 * move. Money is integer tiyin throughout.
 *
 * The manager reads one branch, not five — every figure below is Chilonzor's,
 * and the branch switcher is what will parameterise the call.
 */

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

export type WaiterRow = {
  id: string;
  /** A person's name is a proper noun; it is not translated. */
  name: string;
  initials: string;
  tickets: number;
  covers: number;
  revenue: number;
  /** Their average ticket, in tiyin. Derived server-side, not in the client. */
  average: number;
};

/**
 * A kitchen station and how long it is taking.
 *
 * The four are the ones `console.kitchen` already names — the KDS tabs and this
 * panel are describing the same stations, and a second list of station names
 * would be a second list to keep in step.
 */
export type StationRow = {
  id: 'grill' | 'hot' | 'cold' | 'bar';
  minutes: number;
  /** The time this station is expected to hit. Over it, the bar turns. */
  target: number;
};

/** The floor, by status. The four add up to `total`. */
export type FloorCount = {
  total: number;
  free: number;
  busy: number;
  reserved: number;
  cleaning: number;
};

export type ShiftPerson = {
  id: string;
  name: string;
  initials: string;
  /** Which of the eight they are working as today. */
  role: 'waiter' | 'cashier' | 'kitchen' | 'warehouse';
  from: string;
};

/**
 * Something a member of staff cannot do alone.
 *
 * `action` keys into `console.permissions`, which already names all twenty
 * gated actions in three languages — the approval queue and the permission
 * matrix are describing the same list and should not word it twice.
 */
export type Approval = {
  id: string;
  who: string;
  action: keyof Messages['console']['permissions'];
  /** In tiyin, or null for an action that is not about money. */
  amount: number | null;
  minutesAgo: number;
};

export type ManagerOverview = {
  greetingName: string;
  openOrders: number;
  averageWaitMinutes: number;
  cancelled: number;
  covers: number;
  waiters: readonly WaiterRow[];
  stations: readonly StationRow[];
  floor: FloorCount;
  onShift: readonly ShiftPerson[];
  approvals: readonly Approval[];
};

const PLACEHOLDER: ManagerOverview = {
  greetingName: 'Aziza',
  openOrders: 12,
  averageWaitMinutes: 9,
  cancelled: 1,
  covers: 148,

  waiters: [
    {
      id: 'aziza',
      name: 'Aziza Rasulova',
      initials: 'AR',
      tickets: 14,
      covers: 41,
      revenue: som(1_842_000),
      average: som(131_571),
    },
    {
      id: 'nodira',
      name: 'Nodira Saidova',
      initials: 'NS',
      tickets: 12,
      covers: 38,
      revenue: som(1_614_000),
      average: som(134_500),
    },
    {
      id: 'jasur',
      name: 'Jasur Toshev',
      initials: 'JT',
      tickets: 11,
      covers: 34,
      revenue: som(1_208_000),
      average: som(109_818),
    },
    {
      id: 'otabek',
      name: 'Otabek Sultonov',
      initials: 'OS',
      tickets: 9,
      covers: 27,
      revenue: som(918_000),
      average: som(102_000),
    },
    {
      id: 'nilufar',
      name: 'Nilufar Yusupova',
      initials: 'NY',
      tickets: 7,
      covers: 22,
      revenue: som(742_000),
      average: som(106_000),
    },
  ],

  // The grill is over its target, which is what turns its bar. The design's
  // rule for bars: past is brand-200, current brand-500, over-threshold warning.
  stations: [
    { id: 'grill', minutes: 14, target: 12 },
    { id: 'hot', minutes: 11, target: 12 },
    { id: 'cold', minutes: 6, target: 8 },
    { id: 'bar', minutes: 3, target: 5 },
  ],

  floor: { total: 32, free: 11, busy: 14, reserved: 4, cleaning: 3 },

  onShift: [
    { id: 'aziza', name: 'Aziza Rasulova', initials: 'AR', role: 'waiter', from: '11:00' },
    { id: 'nodira', name: 'Nodira Saidova', initials: 'NS', role: 'waiter', from: '11:00' },
    { id: 'jasur', name: 'Jasur Toshev', initials: 'JT', role: 'waiter', from: '10:00' },
    { id: 'dilshod', name: 'Dilshod Karimov', initials: 'DK', role: 'cashier', from: '10:00' },
    { id: 'bekzod', name: 'Bekzod Alimov', initials: 'BA', role: 'kitchen', from: '09:00' },
    { id: 'sardor', name: 'Sardor Nazarov', initials: 'SN', role: 'warehouse', from: '08:00' },
  ],

  approvals: [
    { id: 'ap-1', who: 'Jasur Toshev', action: 'aDiscount20', amount: som(186_000), minutesAgo: 4 },
    { id: 'ap-2', who: 'Nodira Saidova', action: 'aVoid', amount: som(42_000), minutesAgo: 11 },
  ],
};

/**
 * Where the backend plugs in.
 *
 * TODO(api): GET /api/v1/analytics/shift-overview, with the branch as the
 * X-Branch header. The approval queue is the one part that must not be polled —
 * it belongs on the `notification.*` channel, per the design's §5.3.
 */
export async function getManagerOverview(
  branchSlug: string | null = null,
): Promise<ManagerOverview> {
  void branchSlug;

  return PLACEHOLDER;
}
