import { scaleFor, type Period } from './overview-data';

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

/**
 * The floor, by status.
 *
 * `reserved` and `cleaning` are nullable because the server splits the room two
 * ways and the design's donut splits it four: `FloorTally` publishes `occupied`
 * and `free`, and its own docblock says a table being cleaned is neither. Null
 * is "this room is not counted that way", which the donut draws as two slices;
 * zeroing them would tell a manager no table is booked tonight, which is the
 * single thing this panel exists to stop them getting wrong.
 */
export type FloorCount = {
  total: number;
  free: number;
  busy: number;
  reserved: number | null;
  cleaning: number | null;
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
 * `action` is `PosApproval::ACTIONS`, in this console's own spelling. It used to
 * key into `console.permissions` — twenty gated actions already worded in three
 * languages — and that read well until the queue became live: the till asks for
 * `discount`, and the matrix words two ceilings (`aDiscount5`, `aDiscount20`),
 * so mapping one onto the other put a ceiling on screen that nobody had asked
 * for. Ten keys of its own, named after what the till actually sends.
 */
export type ApprovalAction =
  | 'voidLine'
  | 'voidOrder'
  | 'discount'
  | 'priceOverride'
  | 'reopenBill'
  | 'refund'
  | 'drawerOpen'
  | 'comp'
  | 'shiftVariance'
  | 'creditSale';

export type Approval = {
  id: string;
  who: string;
  action: ApprovalAction;
  /** In tiyin, or null for an action that is not about money. */
  amount: number | null;
  minutesAgo: number;
};

export type ManagerOverview = {
  greetingName: string;
  /**
   * What the figures are about — the pinned venue, or the restaurant itself.
   *
   * From the session, not the report: the line under the greeting names a
   * place, and it used to name Chilonzor to every manager of every tenant.
   */
  placeName: string;
  /**
   * False when this is the design's own screen rather than the restaurant's.
   *
   * Every figure below reads differently under it: a fixture keeps the design's
   * targets and delta chips, a live one draws no rail it cannot justify and a
   * dash where the server would not answer.
   */
  live: boolean;
  openOrders: number | null;
  averageWaitMinutes: number | null;
  cancelled: number | null;
  covers: number | null;
  waiters: readonly WaiterRow[];
  stations: readonly StationRow[];
  floor: FloorCount | null;
  /** The people on shift. Empty on a live payload — see `onShiftCount`. */
  onShift: readonly ShiftPerson[];
  /**
   * How many are checked in, which is all `App\Contracts\Staff\Roster`
   * publishes: *"anything richer — names, roles, lateness — is personnel data
   * and stays behind the Staff module's own permissions"*. The panel says the
   * number rather than truncating the fixture's six people to it.
   */
  onShiftCount: number | null;
  approvals: readonly Approval[];
};

const PLACEHOLDER = {
  greetingName: 'Aziza',
  placeName: 'Chilonzor',
  live: false,
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

  onShiftCount: 6,

  approvals: [
    { id: 'ap-1', who: 'Jasur Toshev', action: 'discount', amount: som(186_000), minutesAgo: 4 },
    { id: 'ap-2', who: 'Nodira Saidova', action: 'voidOrder', amount: som(42_000), minutesAgo: 11 },
  ],
} satisfies ManagerOverview;

/**
 * The fixture this screen falls back to.
 *
 * The live seam is `./dashboard-server.ts` — `getManagerLive()` against
 * `GET /api/v1/dashboard?role=manager` — and the mapping is in
 * `./dashboard-map.ts`, which names panel by panel what that endpoint answers
 * and what still comes from here. The approval queue is one of the ones that
 * stays: it must not be polled at all, because it belongs on the
 * `notification.*` channel, per the design's §5.3.
 */
export async function getManagerOverview(
  branchSlug: string | null = null,
  period: Period = 'today',
): Promise<ManagerOverview> {
  void branchSlug;

  /*
   * The counts move with the period; the floor and the approval queue do not.
   * Thirty-two tables are thirty-two tables, and a request waiting on a PIN is
   * waiting *now* — multiplying either by six would be nonsense on the screen.
   */
  const factor = scaleFor(period);

  if (factor === 1) return PLACEHOLDER;

  return {
    ...PLACEHOLDER,
    openOrders: Math.round(PLACEHOLDER.openOrders * factor),
    cancelled: Math.round(PLACEHOLDER.cancelled * factor),
    covers: Math.round(PLACEHOLDER.covers * factor),
    waiters: PLACEHOLDER.waiters.map((waiter) => ({
      ...waiter,
      revenue: Math.round(waiter.revenue * factor),
    })),
  };
}
