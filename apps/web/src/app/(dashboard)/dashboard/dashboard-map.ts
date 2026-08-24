import type {
  AccountantOverview,
  CashMonth,
  PaymentMethod,
  UpcomingPayment,
} from './accountant-data';
import type { CashierOverview, Payment, PaymentMethodId } from './cashier-data';
import type {
  Approval,
  ApprovalAction,
  ManagerOverview,
  StationRow,
  WaiterRow,
} from './manager-data';
import type {
  ChannelLoad,
  IntakeChannelKey,
  LateDelivery,
  OperatorOverview,
} from './operator-data';
import type { OrderStatus } from './overview-data';
import type { MyOrder, MySeller, MyTable, TableStatus, WaiterOverview } from './waiter-data';
import type { ConsumedItem, Delivery, WarehouseOverview } from './warehouse-data';

/**
 * `GET /api/v1/dashboard` → the six role dashboards, as pure arithmetic.
 *
 * Split out of `./dashboard-server.ts` deliberately. The fetch is a pipe: it
 * either answers or it does not, and a person notices immediately. The mapping
 * is the half that is wrong *silently* — another waiter's takings under this
 * waiter's name, a voided ticket drawn as paid, a margin off by a factor of a
 * hundred — so it is a pure function of two arguments and every figure below is
 * asserted in `./dashboard-map.test.ts` as an exact number.
 *
 * Same rule `./crew-server.ts` follows on the phone, and the same reason.
 *
 * ---------------------------------------------------------------------------
 * The two contracts these functions sit between
 *
 * The payload speaks integer tiyin with a `_tiyin` suffix and percentages as
 * percentages — 16.4 is 16.4%, never 0.164. The screens speak the types in the
 * `*-data.ts` files beside this one, which are frozen: a mapping that wanted a
 * different shape would be a mapping asking the design to move.
 *
 * ---------------------------------------------------------------------------
 * What "honest" means here, concretely
 *
 * Three rules, and every judgement call below is one of them:
 *
 *  1. **A block the payload does not carry keeps the fixture.** `undefined` is
 *     "not answered", and the shell's `live` banner is what tells the reader
 *     which half of a screen is real. Filling a panel from what is merely
 *     reachable puts a plausible number beside a true one.
 *  2. **A block the payload carries is used even when it is empty.** A cashier
 *     who has taken nothing has taken nothing, and showing them the fixture's
 *     six payments would be the only lie on the screen. The exceptions are
 *     named one by one below: four panels divide by their own maximum and an
 *     empty list makes that `-Infinity`.
 *  3. **A `null` KPI stays null all the way to the card.** The server sends
 *     `null` when it cannot answer honestly — `gross_profit` and `labour_cost`
 *     will be null for a while, `average_wait_minutes` on a venue that has
 *     served nobody — and both a zero and the fixture's figure in its place
 *     are claims rather than blanks. `./figures.ts` draws it as a dash, which
 *     is what the owner's cards have always done.
 *
 *  4. **A panel with no live source is empty, never borrowed.** Four of the
 *     manager's eight panels used to be the demo restaurant's — station load,
 *     floor occupancy, who is on shift, the approval queue — drawn beside four
 *     live ones with nothing saying which was which. Where a source exists it
 *     is now read (the floor tally, the approval queue); where none does the
 *     screen says so.
 */

/* ------------------------------------------------------------- the payload */

export type ApiKpi = {
  key: string;
  unit: 'money' | 'count' | 'percent';
  /** `null` when the server cannot answer this figure honestly. */
  value: number | null;
  delta_percent: number | null;
};

export type ApiWindow = {
  period: 'today' | 'week' | 'month';
  from: string;
  to: string;
  days: number;
};

/**
 * One hour of trading.
 *
 * `average_tiyin` is what this weekday usually takes at this hour, over the
 * last eight of them. Null when there is nothing to average — a new
 * restaurant, an hour it has never traded in — and null for any window longer
 * than a day, because a one-day baseline drawn under a seven-day bar would
 * report the restaurant beating its own average by 600% every week.
 */
export type ApiHour = { hour: number; revenue_tiyin: number; average_tiyin?: number | null };

export type ApiTopItem = { sku: string; title: string; sold: number; revenue_tiyin: number };

export type ApiBranch = {
  branch_id: number | null;
  name: string | null;
  revenue_tiyin: number;
  orders_count: number;
};

/** `channel` is `App\Support\Orders\OrderChannel` — how the order was fulfilled. */
export type ApiChannel = { channel: string; orders_count: number; revenue_tiyin: number };

/** `method` is one of cash · card · wallet · transfer · credit. */
export type ApiMethod = { method: string; amount_tiyin: number; count: number };

export type ApiExpense = { category: string; amount_tiyin: number };

/** `month` is `2026-08`. */
export type ApiCashMonth = { month: string; inflow_tiyin: number; outflow_tiyin: number };

export type ApiPayment = {
  id: number;
  at: string;
  /**
   * The bill this settled, by NUMBER — `A-1286`, which is what a guest reads
   * off a receipt. Null when the bill it belonged to has been soft-deleted, so
   * the log still shows the money rather than dropping the row.
   */
  order: string | null;
  method: string;
  amount_tiyin: number;
  refund: boolean;
};

/** `status` is the order ladder's own word — `App\Support\Orders\OrderState`. */
export type ApiOrderRow = { number: string; where: string; status: string; total_tiyin: number };

export type ApiAttention = { key: string; level: 'warn' | 'note'; href: string };

export type ApiWaiter = {
  user_id: number;
  name: string;
  tickets: number;
  covers: number;
  revenue_tiyin: number;
  average_tiyin: number;
};

export type ApiConsumed = {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  cost_tiyin: number;
};

export type ApiWaiterOrder = {
  number: string;
  table: string | null;
  status: string;
  items: number;
  total_tiyin: number;
  minutes_ago: number;
};

export type ApiLate = { number: string; where: string; minutes_late: number; reason: string };

export type ApiShift = {
  id: number;
  number: string;
  opened_at: string;
  opening_cash_tiyin: number;
  expected_cash_tiyin: number;
};

export type ApiStock = { ok: number; low: number; out: number; expiring: number };

export type ApiFloor = { occupied: number; free: number };

/** One section of the kitchen line, and how fast it is clearing. */
export type ApiStation = {
  /** The station's own word — `grill`, `hot`, `cold`, `bar`, `pastry`. */
  station: string;
  open: number;
  /** Fired to ready, averaged over the window. Null when none finished. */
  average_minutes: number | null;
  target_minutes: number;
};

/** One purchase order seen from the receiving bay. */
export type ApiDelivery = {
  id: number;
  number: string;
  supplier: string;
  lines: number;
  expected_at: string | null;
  /**
   * The same instant as a wall clock in the restaurant's own hours — `14:20`.
   *
   * Sent preformatted because the console cannot derive it: every timestamp
   * leaves the API in UTC, and a browser slicing the hour out of the ISO
   * string would tell a storekeeper in Tashkent that the van is due five hours
   * before it is.
   */
  expected_time: string | null;
  received_at: string | null;
  total_tiyin: number;
};

/** An invoice with money still owed on it. */
export type ApiPayable = {
  id: number;
  number: string;
  supplier: string;
  /** What is LEFT, not the invoice total — part payments are real. */
  amount_tiyin: number;
  /** Terms counted from the delivery. Null while it has not arrived. */
  due_at: string | null;
  /**
   * How many sleeps, in the restaurant's own calendar. Negative once the
   * deadline has passed.
   *
   * Counted on the server because a day boundary needs a timezone and the
   * console has none: a console rendered on a UTC box would flip "due in three
   * days" to two at seven in the evening Tashkent time, for a deadline that had
   * not moved.
   */
  due_in_days: number | null;
};

/** One table in a waiter's own section, with whatever is running on it. */
export type ApiMyTable = {
  id: number;
  label: string;
  seats: number;
  /** `regular` | `vip` | `terrace` | `bar` — the table's own word. */
  kind: string;
  /** The hall's name as this restaurant calls it, or null. */
  zone: string | null;
  /** `free` | `occupied` | `reserved` | `cleaning`. */
  status: string;
  since: string | null;
  /** `HH:MM` in the restaurant's hours — see `ApiDelivery.expected_time`. */
  since_time: string | null;
  bill_tiyin: number | null;
  guests: number | null;
};

/**
 * `GET /api/v1/pos/approvals` → one pending request.
 *
 * Not on the dashboard payload: this is a second read, made beside it in
 * `./dashboard-server.ts`. It lives here because it is mapped here, and because
 * a shape described in two files is a shape that drifts.
 */
export type ApiApproval = {
  id: number;
  action: string;
  amount: number | null;
  requested_by?: { id: number | null; name: string | null } | null;
  requested_at: string | null;
};

/** How an order reached the desk — `Order::INTAKE_CHANNELS`, not `OrderChannel`. */
export type ApiIntakeChannel = { channel: string; orders_count: number; revenue_tiyin: number };

/**
 * One envelope, seven shapes.
 *
 * Every role-specific block is optional because the endpoint answers a
 * different set per role — and because a block the server has not learned to
 * compute yet arrives absent rather than empty, which is the distinction rule 1
 * and rule 2 above turn on.
 */
export type ApiDashboard = {
  role: string;
  window: ApiWindow;
  currency: 'UZS';
  kpis: ApiKpi[];

  /* owner */
  branches?: ApiBranch[];
  hours?: ApiHour[];
  top_items?: ApiTopItem[];
  attention?: ApiAttention[];
  recent_orders?: ApiOrderRow[];

  /* manager */
  channels?: ApiChannel[];
  stations?: ApiStation[];
  open_orders?: number;
  waiters?: ApiWaiter[];
  floor?: ApiFloor;
  on_shift_count?: number;
  average_wait_minutes?: number | null;
  cancelled?: number;
  covers?: number;

  /* cashier */
  shift?: ApiShift | null;
  methods?: ApiMethod[];
  recent_payments?: ApiPayment[];
  refunds?: number;
  tables_awaiting?: number;

  /* accountant */
  expenses?: ApiExpense[];
  unbanked?: number;
  cashflow?: ApiCashMonth[];
  unpaid_invoices?: number;
  overdue_invoices?: number;
  payables_tiyin?: number;
  upcoming?: ApiPayable[];
  /** A plan from `tenants.settings` → `targets.*`, null until one is set. */
  expense_budget_tiyin?: number | null;

  /* warehouse */
  stock?: ApiStock;
  consumed?: ApiConsumed[];
  waste_percent?: number | null;
  deliveries?: ApiDelivery[];
  deliveries_expected?: number;
  deliveries_accepted?: number;

  /* waiter */
  orders?: ApiWaiterOrder[];
  tables?: ApiMyTable[];

  /* operator */
  hourly?: number[];
  late?: ApiLate[];
  declined?: number;
  intake_channels?: ApiIntakeChannel[];
};

/* -------------------------------------------------------------- the pieces */

/** One KPI's figure, or `null` when the server left it out or could not answer. */
function figure(kpis: readonly ApiKpi[], key: string): number | null {
  const card = kpis.find((kpi) => kpi.key === key);

  return card === undefined ? null : card.value;
}

/**
 * A whole number from a KPI — money in tiyin, or a count.
 *
 * Rounded because the screens format integers and a fractional tiyin is not a
 * thing that exists; `Math.round` rather than a truncation so a figure the
 * server derived as an average does not lose a tiyin per read.
 *
 * Null travels through. It used to take a fallback and hand back the fixture's
 * number, which turned the server's "I cannot answer" into a money figure on a
 * live card with no marker — `overview-server.ts` already drew the owner's
 * dash, so one tenant got two different behaviours depending on which role
 * opened the console.
 */
function whole(kpis: readonly ApiKpi[], key: string): number | null {
  const value = figure(kpis, key);

  return value === null ? null : Math.round(value);
}

/**
 * A percentage from a KPI, decimal intact.
 *
 * Deliberately not rounded. A net margin is printed to one decimal and 16.4
 * rounded to 16 is a different claim about the business — which is the whole
 * reason margins are carried as percentages rather than as two sums.
 *
 * Null travels through, for the reason `whole()` gives.
 */
function ratio(kpis: readonly ApiKpi[], key: string): number | null {
  return figure(kpis, key);
}

/**
 * The two letters in an avatar circle.
 *
 * Built here rather than asked for, because it is presentation: the server
 * knows a person's name and the console decides how a name becomes a badge.
 * Two words at most — a three-letter circle overflows the 36px the design draws.
 */
function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter((part) => part !== '')
    .slice(0, 2)
    .map((part) => part.slice(0, 1))
    .join('')
    .toUpperCase();
}

/** The width of the little bar beside a row: this line against the biggest. */
function shareOf(value: number, best: number): number {
  return best > 0 ? value / best : 0;
}

/**
 * The ladder's thirteen states, in the six words these screens have.
 *
 * The console names `new · accepted · cooking · ready · to_pay · paid` and
 * `App\Support\Orders\OrderState` has thirteen. The five with no word here —
 * `voided`, `refunded`, `comped`, and `draft` before it is placed — are
 * deliberately absent rather than folded into the nearest neighbour: a voided
 * ticket drawn under the "paid" chip tells an owner money came in for food that
 * was cancelled, and that is the one row on the panel they would act on.
 *
 * Rows whose state is not in this table are left off the list. A recent-orders
 * panel is a sample of the last few tickets, not a ledger — a gap in it is
 * visible as a gap, where a mislabelled row is not visible at all.
 */
const LADDER: Readonly<Record<string, OrderStatus>> = {
  placed: 'new',
  new: 'new',
  accepted: 'accepted',
  cooking: 'cooking',
  ready: 'ready',
  served: 'ready',
  enroute: 'ready',
  handed: 'ready',
  topay: 'to_pay',
  to_pay: 'to_pay',
  paid: 'paid',
};

/**
 * The three tenders the till dashboard draws, in the design's own order.
 *
 * `transfer` and `credit` are real tenders — a bank transfer settles an
 * aggregator invoice and P13 sells on account — and neither has a slice on this
 * donut or a label in `console.dashCashier`. They are left out rather than
 * folded into `card`, because the figure directly under this donut is what the
 * cashier is counted against at the end of the shift, and a credit sale added
 * to the card total is a variance nobody can explain.
 */
const TILL_METHODS: readonly PaymentMethodId[] = ['card', 'cash', 'wallet'];

/** The four the accountant's donut draws. Only `credit` has no slice here. */
const LEDGER_METHODS: readonly PaymentMethod['id'][] = ['card', 'cash', 'wallet', 'transfer'];

/**
 * The month labels the cash-flow chart prints under its bars.
 *
 * Uzbek three-letter abbreviations, because that is what the design draws and
 * what the fixture already carries — `Mar · Apr · May · Iyn · Iyl · Avg`. A
 * locale-aware label belongs in the component, and the component has no month
 * formatter today; inventing a second vocabulary here would guarantee the two
 * disagree the moment one is fixed.
 */
const MONTH_LABEL: readonly string[] = [
  'Yan',
  'Fev',
  'Mar',
  'Apr',
  'May',
  'Iyn',
  'Iyl',
  'Avg',
  'Sen',
  'Okt',
  'Noy',
  'Dek',
];

/** `2026-08` → `Avg`. An unparseable month keeps its own id, never a blank. */
function monthLabel(id: string): string {
  const index = Number(id.slice(5, 7)) - 1;

  return MONTH_LABEL[index] ?? id;
}

/**
 * A store's own unit, narrowed to the three this screen can print.
 *
 * Anything unrecognised reads as pieces. That is the safe direction: a count is
 * unit-free, so labelling flour "84 dona" is merely coarse, where labelling
 * eggs "84 kg" states a weight the store never recorded.
 */
function unitOf(unit: string): ConsumedItem['unit'] {
  const word = unit.trim().toLowerCase();

  if (word === 'kg' || word === 'kilogram') return 'kg';
  if (word === 'l' || word === 'litr' || word === 'liter') return 'l';

  return 'dona';
}

/**
 * The four stations the design's chart draws, against the five the KDS runs.
 *
 * `pastry` has a station on the server and no bar here, because the design's
 * panel names four and `StationRow['id']` is that union. A row it cannot key is
 * dropped rather than folded into another: adding the pastry section's minutes
 * to the cold section's would misstate the one comparison this panel exists to
 * make, and a manager would walk to the wrong bench.
 */
const STATION_BARS: Readonly<Record<string, StationRow['id']>> = {
  grill: 'grill',
  hot: 'hot',
  cold: 'cold',
  bar: 'bar',
};

/**
 * One bar per section that has actually cooked something.
 *
 * A null average is dropped rather than drawn as zero, and that is the whole
 * judgement in this function. `StationRow.minutes` is a number the chart sizes
 * a bar from, so a section that finished nothing would draw an empty bar next
 * to a full one — which reads as "the cold section is instant", the opposite of
 * "the cold section is idle". A section with nothing to say says nothing.
 */
function stationsFrom(api: readonly ApiStation[] | undefined): StationRow[] {
  if (api === undefined) return [];

  return api.flatMap((row): StationRow[] => {
    const id = STATION_BARS[row.station];

    if (id === undefined || row.average_minutes === null) return [];

    return [{ id, minutes: row.average_minutes, target: row.target_minutes }];
  });
}

/* ------------------------------------------------------------- the manager */

/**
 * The branch manager's shift dashboard.
 *
 * What each panel reads, and what it says when it cannot:
 *
 *  - **`waiters`** goes through empty. It used to fall back to five named
 *    people with takings against their names whenever the leaderboard was
 *    empty, and the stated reason was that `manager.tsx` sized its bars with
 *    `Math.max(...)`, which is `-Infinity` on an empty array. That was a
 *    one-line fix in the consumer (`peakOf` in `./figures.ts`), not a reason
 *    to invent staff.
 *  - **`floor`** is the payload's own tally. Two of the donut's four slices are
 *    null because `FloorTally` publishes two — see `FloorCount`.
 *  - **`onShift`** is empty and `onShiftCount` carries the number, which is all
 *    `App\Contracts\Staff\Roster` will publish. Truncating the fixture's six
 *    people to a live count would put the wrong six names on screen.
 *  - **`stations`** is live. It used to be empty with a paragraph explaining
 *    that "how long the grill is taking" was a KDS aggregate this endpoint did
 *    not carry; `App\Contracts\Kitchen\KitchenLoad` grew a `stations()`
 *    method for exactly this panel and now it does. Sections that finished
 *    nothing are dropped rather than drawn at zero — see `stationsFrom()`.
 *  - **`approvals`** is a second read, made beside this one — see
 *    `approvalsFrom()` and `./dashboard-server.ts`. It is the console's most
 *    decision-shaped panel and it sat behind live Approve/Decline buttons with
 *    two invented requests in it.
 */
export function managerFrom(payload: ApiDashboard, fixture: ManagerOverview): ManagerOverview {
  const waiters = payload.waiters;
  const floor = payload.floor;

  return {
    greetingName: fixture.greetingName,
    placeName: fixture.placeName,
    live: true,
    openOrders: payload.open_orders ?? null,
    averageWaitMinutes: payload.average_wait_minutes ?? null,
    cancelled: payload.cancelled ?? null,
    covers: payload.covers ?? whole(payload.kpis, 'guests'),

    waiters:
      waiters === undefined
        ? []
        : waiters.map((waiter): WaiterRow => ({
            // The user id, not the staff-member id: this aggregate is keyed
            // by who signed in, and the row key only has to be stable.
            id: String(waiter.user_id),
            name: waiter.name,
            initials: initialsOf(waiter.name),
            tickets: waiter.tickets,
            covers: waiter.covers,
            revenue: waiter.revenue_tiyin,
            // Derived server-side and taken as given. A client dividing
            // revenue by tickets would disagree with the server the first
            // time a ticket was split across two people.
            average: waiter.average_tiyin,
          })),

    stations: stationsFrom(payload.stations),

    /*
     * `total` is the two states the server counts and nothing more. It is
     * deliberately not "the number of tables in the room": a table being
     * cleaned is in neither column, so a total that claimed to be the room
     * would print a legend whose slices do not add up to it.
     */
    floor:
      floor === undefined
        ? null
        : {
            total: floor.occupied + floor.free,
            free: floor.free,
            busy: floor.occupied,
            reserved: null,
            cleaning: null,
          },

    onShift: [],
    onShiftCount: payload.on_shift_count ?? null,
    approvals: [],
  };
}

/**
 * The six actions a till can ask for, in this console's own spelling.
 *
 * An action nobody has worded is dropped rather than drawn blank: a queue row
 * with no verb on it asks a manager to approve something unnamed, and they
 * would either refuse everything or approve everything.
 */
const APPROVAL_ACTION: Readonly<Record<string, ApprovalAction>> = {
  void_line: 'voidLine',
  void_order: 'voidOrder',
  discount: 'discount',
  price_override: 'priceOverride',
  reopen_bill: 'reopenBill',
  refund: 'refund',
  drawer_open: 'drawerOpen',
  comp: 'comp',
  shift_variance: 'shiftVariance',
  credit_sale: 'creditSale',
};

/**
 * The pending queue, from `GET /api/v1/pos/approvals`.
 *
 * `now` is a parameter so this is a pure function with an exact answer: a clock
 * read inside would make every expected minute approximate. Same rule
 * `crew-server.ts` follows for the phone's copy of this queue, and the same
 * reason — these two lists must agree, because they are answered by the same
 * manager from two different devices.
 *
 * An amount of null stays null. `Approval.amount` is "null for an action that
 * is not about money", and drawer_open is exactly that; a zero would render as
 * "0 so'm" beside a request that has no sum.
 */
export function approvalsFrom(
  rows: readonly ApiApproval[] | undefined,
  now: Date,
): readonly Approval[] {
  if (rows === undefined) return [];

  return rows.flatMap((row): Approval[] => {
    const action = APPROVAL_ACTION[row.action];

    if (action === undefined) return [];

    return [
      {
        id: String(row.id),
        // The person, or an em dash — an approval raised by an account since
        // deleted is still a decision somebody has to make.
        who: row.requested_by?.name ?? '—',
        action,
        amount: row.amount,
        minutesAgo: minutesSince(row.requested_at, now),
      },
    ];
  });
}

/** Whole minutes since an ISO instant. Zero when nothing says when. */
function minutesSince(iso: string | null, now: Date): number {
  if (iso === null) return 0;

  const then = Date.parse(iso);

  if (Number.isNaN(then)) return 0;

  return Math.max(0, Math.round((now.getTime() - then) / 60_000));
}

/* ------------------------------------------------------------- the cashier */

/**
 * The cashier's till dashboard.
 *
 * `shift: null` is a real answer — `RoleDashboards::currentShift()` says the
 * cashier has not opened a drawer yet — and it used to fall back to the
 * fixture's 2 184 000 so'm. That is the single figure on this platform where an
 * invented value produces a real accusation: a count against a drawer that was
 * never opened is short by whatever the demo said was in it. Null, a dash, and
 * the button that opens a till.
 *
 * `tablesAwaiting` is live now — `tables_awaiting` counts distinct tables in
 * `topay`. It was a constant three, and it is the one figure on this screen a
 * cashier can check by looking up.
 */
export function cashierFrom(payload: ApiDashboard, fixture: CashierOverview): CashierOverview {
  const shift = payload.shift;
  const methods = payload.methods;
  const recent = payload.recent_payments;

  const byMethod = new Map((methods ?? []).map((row) => [row.method, row]));

  return {
    greetingName: fixture.greetingName,
    placeName: fixture.placeName,
    live: true,

    drawer: shift == null ? null : shift.expected_cash_tiyin,
    openingFloat: shift == null ? null : shift.opening_cash_tiyin,

    /*
     * How many payments were taken, over *every* tender — including the two
     * with no slice on the donut below. The card asks "how many", and that
     * question is answerable in full even where the split is not.
     */
    payments:
      methods === undefined ? null : methods.reduce((running, row) => running + row.count, 0),

    refunds: payload.refunds ?? null,
    tablesAwaiting: payload.tables_awaiting ?? null,

    recent:
      recent === undefined
        ? []
        : recent.flatMap((payment): Payment[] => {
            const method = TILL_METHODS.find((id) => id === payment.method);

            // A transfer or a credit sale has no column here; see TILL_METHODS.
            if (method === undefined) return [];

            return [
              {
                id: String(payment.id),
                time: clockFrom(payment.at),
                // An em dash where the bill is gone: the payment happened and
                // belongs in the log, and a blank cell reads as a broken row.
                order: payment.order ?? '—',
                method,
                // Present only when true: `Payment.refund` is optional and the
                // row reads "a payment, unless flagged".
                ...(payment.refund ? { refund: true } : {}),
                amount: payment.amount_tiyin,
              },
            ];
          }),

    methods:
      methods === undefined
        ? []
        : TILL_METHODS.map((id) => ({ id, amount: byMethod.get(id)?.amount_tiyin ?? 0 })),
  };
}

/**
 * An ISO instant → `13:42`, which is how the payment log reads.
 *
 * The server sends an offset-aware timestamp, so this renders in the machine's
 * zone — the same thing `staff-server.ts` does for the rota column, and correct
 * for a console whose reader is standing in the venue.
 */
function clockFrom(iso: string): string {
  const at = new Date(iso);

  if (Number.isNaN(at.getTime())) return '—';

  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

/* ---------------------------------------------------------- the accountant */

/**
 * The accountant's finance dashboard.
 *
 * Four figures used to be constants on a live screen and each was a statement
 * about a business that had issued no invoice: eleven unpaid, four overdue, a
 * 168m expense budget and 16.4% net margin. `expenseBudget` is a *plan* and
 * belongs in settings; `unpaidInvoices`, `overdueInvoices`, `upcoming` and
 * `taxes` are Suppliers' question, one module along, about documents this
 * endpoint never reads. All of them are null or empty here, and the panels draw
 * their own empty state.
 */
export function accountantFrom(
  payload: ApiDashboard,
  fixture: AccountantOverview,
): AccountantOverview {
  const cashflow = payload.cashflow;
  const methods = payload.methods;

  const byMethod = new Map((methods ?? []).map((row) => [row.method, row]));

  return {
    greetingName: fixture.greetingName,
    placeName: fixture.placeName,
    live: true,
    revenueMtd: whole(payload.kpis, 'revenue'),
    expenses: whole(payload.kpis, 'expenses'),
    /*
     * A plan, not a ledger figure — `tenants.settings` → `targets.*`.
     *
     * `null` and `0` are the same statement here and the server sends null for
     * both: a restaurant that has never set a budget must draw a dash, not a
     * bar reporting every som spent as an overspend.
     */
    expenseBudget: payload.expense_budget_tiyin ?? null,
    netMargin: ratio(payload.kpis, 'net_margin'),
    unpaidInvoices: payload.unpaid_invoices ?? null,
    overdueInvoices: payload.overdue_invoices ?? null,

    cashflow:
      cashflow === undefined
        ? []
        : cashflow.map((month): CashMonth => ({
            id: month.month,
            label: monthLabel(month.month),
            inflow: month.inflow_tiyin,
            outflow: month.outflow_tiyin,
          })),

    methods:
      methods === undefined
        ? []
        : LEDGER_METHODS.map((id) => ({ id, amount: byMethod.get(id)?.amount_tiyin ?? 0 })),

    upcoming: upcomingFrom(payload.upcoming),

    /*
     * Still empty, and still for the reason the panel above it no longer has.
     *
     * A VAT or income-tax filing has no producer anywhere on this platform —
     * it needs the Didox e-filing integration, which is one of the nine
     * outstanding external keys in docs/GO-LIVE.md. Three chips reading
     * "tayyor" over a restaurant that has filed nothing is the one lie on this
     * screen that somebody could be fined for believing.
     */
    taxes: [],
  };
}

/**
 * What falls due next, and how soon.
 *
 * `daysUntilDue` is negative when it is already late, which is the whole signal
 * on this list: the panel sorts the reader's attention by it and the design
 * draws the negative rows in red.
 *
 * Taken as given rather than derived. A day boundary needs a timezone — see
 * `ApiPayable.due_in_days` — and the one place the restaurant's own calendar is
 * known is the server. A client subtracting two instants would move a deadline
 * by a day depending on which box rendered the page.
 *
 * A debt with no deadline is dropped rather than dated today: a delivery that
 * has not arrived has not started its terms, and putting it at the top of a
 * list ordered by urgency would push a real one down.
 */
function upcomingFrom(api: readonly ApiPayable[] | undefined): UpcomingPayment[] {
  if (api === undefined) return [];

  return api.flatMap((row): UpcomingPayment[] =>
    row.due_in_days === null
      ? []
      : [
          {
            id: String(row.id),
            supplier: row.supplier,
            amount: row.amount_tiyin,
            daysUntilDue: row.due_in_days,
          },
        ],
  );
}

/* ----------------------------------------------------------- the warehouse */

/**
 * The storekeeper's stock dashboard.
 *
 * `deliveriesToday`, `deliveriesAccepted` and `incoming` all describe goods
 * arriving. They used to go together as null and empty, because a Suppliers
 * receipt was not on this payload and the alternative was the fixture's four
 * scheduled deliveries from suppliers the restaurant has never dealt with, one
 * of them flagged late. `App\Contracts\Suppliers\Purchasing` publishes them
 * now, and they still go together: the KPI card divides one by the other, so
 * an `undefined` in either leaves both null rather than reporting "1 of 0".
 */
export function warehouseFrom(
  payload: ApiDashboard,
  fixture: WarehouseOverview,
  now: Date = new Date(),
): WarehouseOverview {
  const stock = payload.stock;
  const consumed = payload.consumed;

  const best = Math.max(...(consumed ?? []).map((item) => item.cost_tiyin), 0);

  return {
    greetingName: fixture.greetingName,
    placeName: fixture.placeName,
    live: true,

    // The two counts and the shelf are one answer: `stock` carries all four
    // states, and the KPI cards above the donut must not disagree with it.
    lowStock: stock?.low ?? whole(payload.kpis, 'stock_low'),
    expiring: stock?.expiring ?? whole(payload.kpis, 'stock_expiring'),

    deliveriesToday: payload.deliveries_expected ?? null,
    deliveriesAccepted: payload.deliveries_accepted ?? null,

    // A ratio: not rounded, and `null` from the server means "no stock value to
    // measure waste against" rather than "nothing was thrown away".
    wastePercent: payload.waste_percent ?? ratio(payload.kpis, 'waste_percent'),

    stock: stock ?? null,
    incoming: incomingFrom(payload.deliveries, now),

    consumed:
      consumed === undefined
        ? []
        : consumed.map((item): ConsumedItem => ({
            id: String(item.id),
            name: item.name,
            quantity: item.quantity,
            unit: unitOf(item.unit),
            cost: item.cost_tiyin,
            share: shareOf(item.cost_tiyin, best),
          })),
  };
}

/**
 * Vans, and the one word the server refuses to say.
 *
 * `late` is a comparison against a clock, and the API deliberately does not
 * make it — a status baked into a response is stale by the time it is drawn.
 * So the row carries when it was due and whether it was signed for, and the
 * three words the design's chip needs are decided here:
 *
 *   accepted  it arrived — `received_at` is set, whenever it was due
 *   late      it has not arrived and its due time has passed
 *   onWay     everything else
 *
 * A delivery with no due date can never be late, which is correct rather than
 * lenient: nobody agreed a time, so nobody missed one.
 */
function incomingFrom(api: readonly ApiDelivery[] | undefined, now: Date): Delivery[] {
  if (api === undefined) return [];

  return api.map((row): Delivery => {
    const due = row.expected_at === null ? null : new Date(row.expected_at);
    const overdue = due !== null && !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();

    return {
      id: String(row.id),
      supplier: row.supplier,
      items: row.lines,
      /*
       * The API's own wall clock, not one derived here. Every timestamp leaves
       * the API in UTC and only the server knows the restaurant's hours; a
       * browser slicing the ISO string would be five hours out in Tashkent,
       * on the one column whose entire value is the hour. An em dash when
       * nobody put a time on the order.
       */
      time: row.expected_time ?? '—',
      status: row.received_at !== null ? 'accepted' : overdue ? 'late' : 'onWay',
    };
  });
}

/* -------------------------------------------------------------- the waiter */

/**
 * The waiter's shift screen.
 *
 * `tables` is live. It was the biggest omission on this screen: which tables a
 * waiter holds is a join of the floor plan against their own open bills —
 * `packages/surfaces/src/crew/live.ts` does exactly that join for the phone,
 * from two different endpoints — and this payload carried neither side of it.
 * The server does the join now, through `App\Contracts\Tables\FloorBoard`,
 * so the console and the phone cannot disagree about somebody's own section.
 * The alternative that shipped was six sample tables with running bills on
 * them, which sends a waiter across the room to a table that is not there and
 * does not owe 318 000 so'm.
 */
export function waiterFrom(payload: ApiDashboard, fixture: WaiterOverview): WaiterOverview {
  const orders = payload.orders;
  const top = payload.top_items;

  const best = Math.max(...(top ?? []).map((item) => item.sold), 0);

  return {
    greetingName: fixture.greetingName,
    placeName: fixture.placeName,
    live: true,
    myOrders: whole(payload.kpis, 'orders'),
    openOrders: payload.open_orders ?? null,
    covers: whole(payload.kpis, 'guests'),
    sales: whole(payload.kpis, 'revenue'),
    averageTicket: whole(payload.kpis, 'average_cheque'),

    tables: myTablesFrom(payload.tables),

    orders:
      orders === undefined
        ? []
        : orders.flatMap((order): MyOrder[] => {
            const status = LADDER[order.status];

            // A state this screen has no word for — see LADDER.
            if (status === undefined) return [];

            return [
              {
                id: order.number,
                // An em dash rather than a blank cell: a takeaway ticket has no
                // table, and an empty column reads as a broken row.
                table: order.table ?? '—',
                status,
                items: order.items,
                total: order.total_tiyin,
                minutesAgo: order.minutes_ago,
              },
            ];
          }),

    topSellers:
      top === undefined
        ? []
        : top.map((item): MySeller => ({
            id: item.sku,
            name: item.title,
            units: item.sold,
            // Ranked by units here, not by revenue: this panel is "what I
            // sold most of", and the owner's is "what earns most".
            share: shareOf(item.sold, best),
          })),
  };
}

/**
 * The three zones the design draws, against every hall a restaurant may have.
 *
 * Keyed on the TABLE's kind rather than on the hall's name, deliberately.
 * `zone` comes back as whatever this restaurant calls the room — "Terrasa",
 * "2-zal", a manager's own word — and matching on it would put every hall the
 * design did not anticipate into a fallback. The kind is a fixed vocabulary
 * (`regular` | `vip` | `terrace` | `bar`) that the floor plan already enforces.
 *
 * `bar` has no zone in the design's three, and folds into `main`: a bar stool
 * is a seat in the main room as far as this card is concerned, and inventing a
 * fourth zone would change a layout the design settled.
 */
const TABLE_ZONE: Readonly<Record<string, MyTable['zone']>> = {
  regular: 'main',
  bar: 'main',
  terrace: 'terrace',
  vip: 'vip',
};

/** The floor plan's four states, in this screen's five-state vocabulary. */
const TABLE_STATE: Readonly<Record<string, TableStatus>> = {
  free: 'free',
  occupied: 'seated',
  reserved: 'reserved',
  cleaning: 'cleaning',
};

/**
 * A waiter's own section.
 *
 * `toPay` is deliberately not derived here even though this screen has a word
 * for it: whether a bill has been asked for is the ORDER's state, and the
 * payload carries the table's. Guessing it from "occupied with a bill on it"
 * would paint every table mid-meal as waiting to pay, which is the one state
 * on this card that makes somebody walk over.
 *
 * A state the floor plan has no word for is dropped rather than defaulted:
 * a table drawn `free` that is not is a table the host gives away.
 */
function myTablesFrom(api: readonly ApiMyTable[] | undefined): MyTable[] {
  if (api === undefined) return [];

  return api.flatMap((row): MyTable[] => {
    const status = TABLE_STATE[row.status];

    if (status === undefined) return [];

    return [
      {
        id: String(row.id),
        number: row.label,
        zone: TABLE_ZONE[row.kind] ?? 'main',
        seats: row.seats,
        status,
        // The API's own wall clock — see `incomingFrom()` for why it is not
        // derived here. Null when nothing has started on the table.
        since: row.since_time,
        bill: row.bill_tiyin,
        guests: row.guests,
      },
    ];
  });
}

/* ------------------------------------------------------------ the operator */

/**
 * How many bars the intake load chart draws, and where it starts.
 *
 * Noon to midnight — the operator's shift, not the restaurant's day.
 * `operator-data.ts` builds its labels as `12 + index`, so an array that did
 * not start at noon would be drawn under the wrong hours.
 */
const INTAKE_FROM_HOUR = 12;
const INTAKE_HOURS = 12;

/**
 * The five doors this panel draws, against the six the column records.
 *
 * `wolt` has a lane on the server and no key here, because the design's channel
 * panel names five. A row it cannot key is dropped rather than folded into
 * another door: adding Wolt's orders to Yandex's would misstate the one split
 * this panel exists to show, and an operator comparing lanes would act on it.
 */
const INTAKE_LANE: Readonly<Record<string, IntakeChannelKey>> = {
  phone: 'phone',
  telegram: 'telegram',
  yandex: 'yandex',
  uzum: 'uzum',
  site: 'site',
};

/**
 * The order-intake desk.
 *
 * `channels` is live now. It used to be the fixture with a paragraph explaining
 * why it had to be: the payload's `channels` are `dine_in · takeaway ·
 * delivery · aggregator` — how an order was *fulfilled* — and this panel's five
 * are which *door* it came through, so nothing in one answered the other. The
 * answer was not to half-map it but to publish it: `intake_channels` on the
 * operator arm groups by `intake_channel`, which is the column that records the
 * door.
 *
 * Time to answer is the one figure that stays missing, and the card is not
 * drawn rather than filled: it lives in a telephony log this platform does not
 * have, and the sample `0:38` with a `−0:07` improvement chip was the number
 * the whole role is judged on.
 *
 * Every target is null. A target is a policy somebody set, not a total anything
 * produced, and there is nowhere on this platform where one has been set.
 */
export function operatorFrom(payload: ApiDashboard, fixture: OperatorOverview): OperatorOverview {
  const late = payload.late;
  const top = payload.top_items;
  const lanes = payload.intake_channels;

  return {
    greetingName: fixture.greetingName,
    placeName: fixture.placeName,
    live: true,
    taken: whole(payload.kpis, 'orders'),
    takenTarget: null,
    answer: null,
    answerTarget: null,
    answerSeconds: null,
    answerTargetSeconds: null,
    averageOrder: whole(payload.kpis, 'average_cheque'),
    averageOrderTarget: null,
    declined: payload.declined ?? whole(payload.kpis, 'declined'),
    declinedLimit: null,
    queue: payload.open_orders ?? null,

    channels:
      lanes === undefined
        ? []
        : lanes.flatMap((lane): ChannelLoad[] => {
            const key = INTAKE_LANE[lane.channel];

            if (key === undefined) return [];

            return [{ key, orders: lane.orders_count, revenue: lane.revenue_tiyin }];
          }),

    hourly: hourlyFrom(payload.hourly),

    late:
      late === undefined
        ? []
        : late.map((delivery): LateDelivery => ({
            order: delivery.number,
            where: delivery.where,
            // Whole minutes are all the payload carries, so the seconds are
            // printed as `:00` rather than filled in with a plausible
            // remainder — `+12:04` in the fixture is the design's figure, not
            // a precision this endpoint has.
            late: `+${delivery.minutes_late}:00`,
            ...reasonFrom(delivery.reason),
          })),

    top: top === undefined ? [] : top.map((item) => ({ name: item.title, sold: item.sold })),
  };
}

/**
 * Why an order is late, and how loudly to say so.
 *
 * Severity follows the reason rather than a threshold on the clock, and the
 * design's own three rows agree: the one with no rider is red, the two already
 * moving are amber. It is also the more useful split — an order nobody is
 * carrying gets worse on its own, where one in transit is being dealt with.
 */
function reasonFrom(reason: string): Pick<LateDelivery, 'reason' | 'severity'> {
  const waiting = reason === 'no_courier' || reason === 'noCourier';

  return waiting
    ? { reason: 'noCourier', severity: 'danger' }
    : { reason: 'onTheWay', severity: 'warning' };
}

/**
 * The intake load chart's twelve bars.
 *
 * A payload of twenty-four is the whole day and this panel takes the second
 * half of it; a payload of twelve is already this window. Any other length is a
 * window whose bars cannot be labelled — `hourLabel()` would print hours that
 * do not exist — so the chart is drawn empty rather than under the wrong clock.
 */
function hourlyFrom(api: readonly number[] | undefined): readonly number[] {
  if (api === undefined) return [];
  if (api.length === INTAKE_HOURS) return api;
  if (api.length === INTAKE_FROM_HOUR + INTAKE_HOURS) return api.slice(INTAKE_FROM_HOUR);

  return [];
}

/* ---------------------------------------------------------- the dispatcher */

/** The six overviews this module maps. The owner's lives in overview-server.ts. */
export type RoleOverview =
  | ManagerOverview
  | CashierOverview
  | AccountantOverview
  | WarehouseOverview
  | WaiterOverview
  | OperatorOverview;

/**
 * `role`, `payload` and `fixture`, as one discriminated tuple.
 *
 * Written this way so the switch below needs no cast: TypeScript links a
 * destructured rest parameter to its discriminant, so narrowing `role` narrows
 * `fixture` with it. The public signature is the six overloads above it — a
 * caller writes `dashboardFrom('cashier', …)` and gets a `CashierOverview`.
 */
type DashboardArgs =
  | ['manager', ApiDashboard, ManagerOverview]
  | ['cashier', ApiDashboard, CashierOverview]
  | ['accountant', ApiDashboard, AccountantOverview]
  | ['warehouse', ApiDashboard, WarehouseOverview]
  | ['waiter', ApiDashboard, WaiterOverview]
  | ['operator', ApiDashboard, OperatorOverview];

/** Which of the nine roles this dispatcher answers for. */
export type MappedRole = DashboardArgs[0];

export function dashboardFrom(
  role: 'manager',
  payload: ApiDashboard,
  fixture: ManagerOverview,
): ManagerOverview;
export function dashboardFrom(
  role: 'cashier',
  payload: ApiDashboard,
  fixture: CashierOverview,
): CashierOverview;
export function dashboardFrom(
  role: 'accountant',
  payload: ApiDashboard,
  fixture: AccountantOverview,
): AccountantOverview;
export function dashboardFrom(
  role: 'warehouse',
  payload: ApiDashboard,
  fixture: WarehouseOverview,
): WarehouseOverview;
export function dashboardFrom(
  role: 'waiter',
  payload: ApiDashboard,
  fixture: WaiterOverview,
): WaiterOverview;
export function dashboardFrom(
  role: 'operator',
  payload: ApiDashboard,
  fixture: OperatorOverview,
): OperatorOverview;

/**
 * One payload, the right shape.
 *
 * The dispatch is on the role the *screen* asked for, never on `payload.role`.
 * A server that answered with a different role than the one requested is a
 * server that has changed its mind about who is reading, and drawing the shape
 * it named would hand a waiter a manager's leaderboard — the API scopes by
 * permission per request, and the screen is the thing that knows which panels
 * it has.
 */
export function dashboardFrom(...args: DashboardArgs): RoleOverview {
  const [role, payload, fixture] = args;

  switch (role) {
    case 'manager':
      return managerFrom(payload, fixture);
    case 'cashier':
      return cashierFrom(payload, fixture);
    case 'accountant':
      return accountantFrom(payload, fixture);
    case 'warehouse':
      return warehouseFrom(payload, fixture);
    case 'waiter':
      return waiterFrom(payload, fixture);
    case 'operator':
      return operatorFrom(payload, fixture);
  }
}
