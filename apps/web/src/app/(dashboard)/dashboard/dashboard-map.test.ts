/*
 * The payment log prints a wall clock, so a test that pins the exact minute has
 * to pin the zone with it — otherwise it passes on a laptop in Tashkent and
 * fails on a CI runner in UTC. Set before the first `Date` in this file, which
 * is what makes Node re-read it.
 */
process.env.TZ = 'Asia/Tashkent';

import { describe, expect, it } from 'vitest';

import { getAccountantOverview } from './accountant-data';
import { getCashierOverview } from './cashier-data';
import {
  accountantFrom,
  approvalsFrom,
  cashierFrom,
  dashboardFrom,
  managerFrom,
  operatorFrom,
  waiterFrom,
  warehouseFrom,
  type ApiDashboard,
} from './dashboard-map';
import { getManagerOverview } from './manager-data';
import { getOperatorOverview } from './operator-data';
import { getWaiterOverview } from './waiter-data';
import { getWarehouseOverview } from './warehouse-data';

/**
 * Six dashboards, mapped from one payload.
 *
 * The fetch either answers or it does not and a reader finds out immediately.
 * These functions are the half that is wrong *silently*: a leaderboard under
 * the wrong names, a voided ticket drawn as paid, a margin a hundred times too
 * big because a percentage was read as a ratio. Nothing here asserts that a
 * field is defined — every figure is an exact number, because "roughly right"
 * is not a thing to be about somebody's takings.
 *
 * Two cases per role, and the second is the one that catches regressions: a
 * payload that answers nothing must produce a screen that CLAIMS nothing — no
 * figure, no leaderboard, no drawer balance. It used to assert the opposite,
 * that the fixture came through untouched, and that is how the demo
 * restaurant's takings reached a real restaurant's first day. A `null` figure
 * and an empty list are both drawable (`./figures.ts`, the panels' empty
 * states); the fixture is kept only when the whole payload is null, which is
 * `./dashboard-server.ts`'s decision and not this file's.
 */

/** A payload with only the envelope filled in — the role blocks are the tests. */
function payload(over: Partial<ApiDashboard> = {}): ApiDashboard {
  return {
    role: 'manager',
    window: { period: 'today', from: '2026-08-22', to: '2026-08-22', days: 1 },
    currency: 'UZS',
    kpis: [],
    ...over,
  };
}

/** One KPI card, as the server sends it. Money is integer tiyin. */
function kpi(
  key: string,
  value: number | null,
  unit: 'money' | 'count' | 'percent' = 'money',
): ApiDashboard['kpis'][number] {
  return { key, unit, value, delta_percent: null };
}

/* ------------------------------------------------------------- the manager */

describe('managerFrom — the branch manager’s shift', () => {
  it('reads the four figures and the leaderboard', async () => {
    const fixture = await getManagerOverview(null, 'today');

    const mapped = managerFrom(
      payload({
        kpis: [kpi('guests', 173, 'count')],
        open_orders: 7,
        average_wait_minutes: 14,
        cancelled: 2,
        waiters: [
          {
            user_id: 8,
            name: 'Sardor Nazarov',
            tickets: 19,
            covers: 52,
            revenue_tiyin: 240_600_000,
            average_tiyin: 12_663_157,
          },
        ],
      }),
      fixture,
    );

    expect(mapped.openOrders).toBe(7);
    expect(mapped.averageWaitMinutes).toBe(14);
    expect(mapped.cancelled).toBe(2);
    // No `covers` block, so the `guests` KPI answers it.
    expect(mapped.covers).toBe(173);

    expect(mapped.waiters).toEqual([
      {
        id: '8',
        name: 'Sardor Nazarov',
        initials: 'SN',
        tickets: 19,
        covers: 52,
        revenue: 240_600_000,
        // Taken as given rather than divided out: a client computing
        // 240 600 000 / 19 would disagree with the server the first time a
        // ticket was split between two people.
        average: 12_663_157,
      },
    ]);
  });

  it('lets the block outrank the KPI when both answer covers', async () => {
    const fixture = await getManagerOverview(null, 'today');

    const mapped = managerFrom(
      payload({ covers: 204, kpis: [kpi('guests', 173, 'count')] }),
      fixture,
    );

    expect(mapped.covers).toBe(204);
  });

  it('draws the two states the server counts and leaves the other two blank', async () => {
    const fixture = await getManagerOverview(null, 'today');

    const mapped = managerFrom(payload({ floor: { occupied: 21, free: 6 } }), fixture);

    /*
     * The endpoint splits the room `occupied`/`free`; the design's donut adds
     * *reserved* and *cleaning*. Null rather than zero for those two: zero
     * would tell a manager no table is booked tonight, which is the one thing
     * this panel exists to stop them getting wrong, and the fixture's four and
     * three would print a legend that does not add up to the total beside it.
     *
     * The fixture's own 32-table room was what a one-branch restaurant with no
     * floor plan used to read here.
     */
    expect(mapped.floor).toEqual({ total: 27, free: 6, busy: 21, reserved: null, cleaning: null });
    expect(managerFrom(payload(), fixture).floor).toBeNull();
  });

  it('carries the head count and names nobody', async () => {
    const fixture = await getManagerOverview(null, 'today');

    /*
     * `Roster` publishes a number and this panel lists people. Truncating the
     * fixture's six names to four would put four *wrong* names on a live
     * screen, which is the error the storekeeper's "19 people in Chilonzor"
     * was: the count is the honest half and the panel says only that.
     */
    const mapped = managerFrom(payload({ on_shift_count: 4 }), fixture);

    expect(mapped.onShift).toEqual([]);
    expect(mapped.onShiftCount).toBe(4);
    expect(managerFrom(payload(), fixture).onShiftCount).toBeNull();
  });

  it('claims nothing when nothing is answered', async () => {
    const fixture = await getManagerOverview(null, 'today');

    const mapped = managerFrom(payload(), fixture);

    expect(mapped.live).toBe(true);
    expect(mapped.openOrders).toBeNull();
    expect(mapped.averageWaitMinutes).toBeNull();
    expect(mapped.cancelled).toBeNull();
    expect(mapped.covers).toBeNull();
    expect(mapped.waiters).toEqual([]);
    // The four panels that used to be the demo restaurant's, drawn beside four
    // live ones with nothing saying which half was real.
    expect(mapped.stations).toEqual([]);
    expect(mapped.floor).toBeNull();
    expect(mapped.onShift).toEqual([]);
    expect(mapped.approvals).toEqual([]);
    // The greeting is the session's and the mapping is pure, so it passes through.
    expect(mapped.greetingName).toBe(fixture.greetingName);
  });

  it('lets an empty leaderboard through', async () => {
    const fixture = await getManagerOverview(null, 'today');

    /*
     * `manager.tsx` sizes its bars with a maximum over the rows, and an empty
     * spread is `-Infinity` — which is why this used to return five named
     * waiters with takings against their names on a branch that employs none.
     * The fix was `peakOf()` in the consumer, one line.
     */
    expect(managerFrom(payload({ waiters: [] }), fixture).waiters).toEqual([]);
  });
});

describe('approvalsFrom — the manager’s queue', () => {
  const NOW = new Date('2026-08-22T13:00:00+05:00');

  it('words each action and ages each row against a clock it is given', () => {
    const queue = approvalsFrom(
      [
        {
          id: 91,
          action: 'discount',
          amount: 18_600_000,
          requested_by: { id: 4, name: 'Jasur Toshev' },
          requested_at: '2026-08-22T12:56:00+05:00',
        },
        {
          id: 92,
          action: 'drawer_open',
          amount: null,
          requested_by: null,
          requested_at: '2026-08-22T12:49:00+05:00',
        },
        // A verb this console has no word for. A queue row with no action on it
        // asks a manager to approve something unnamed.
        { id: 93, action: 'teleport', amount: 0, requested_at: null },
      ],
      NOW,
    );

    expect(queue).toEqual([
      { id: '91', who: 'Jasur Toshev', action: 'discount', amount: 18_600_000, minutesAgo: 4 },
      // Null amount stays null: `drawer_open` is not about a sum, and a zero
      // would render as "0 so'm" beside a request that has none.
      { id: '92', who: '—', action: 'drawerOpen', amount: null, minutesAgo: 11 },
    ]);
  });

  it('is empty rather than sampled when the queue cannot be read', () => {
    /*
     * No session, or a role without `pos.view`. Empty is the true statement —
     * this console has nothing waiting for a signature — and the alternative
     * put two invented requests behind live Approve and Decline buttons.
     */
    expect(approvalsFrom(undefined, NOW)).toEqual([]);
    expect(approvalsFrom([], NOW)).toEqual([]);
  });
});

/* ------------------------------------------------------------- the cashier */

describe('cashierFrom — one drawer, one shift', () => {
  const SHIFT = {
    id: 4,
    number: 'S-12',
    opened_at: '2026-08-22T09:00:00+05:00',
    opening_cash_tiyin: 40_000_000,
    expected_cash_tiyin: 261_500_000,
  };

  it('takes the drawer and the float from the open shift', async () => {
    const fixture = await getCashierOverview('today');

    const mapped = cashierFrom(payload({ shift: SHIFT }), fixture);

    expect(mapped.drawer).toBe(261_500_000);
    expect(mapped.openingFloat).toBe(40_000_000);
  });

  it('counts every tender but draws only the three with a slice', async () => {
    const fixture = await getCashierOverview('today');

    const mapped = cashierFrom(
      payload({
        methods: [
          { method: 'cash', amount_tiyin: 96_400_000, count: 21 },
          { method: 'card', amount_tiyin: 148_200_000, count: 33 },
          { method: 'credit', amount_tiyin: 16_900_000, count: 2 },
        ],
      }),
      fixture,
    );

    // 21 + 33 + 2. "How many payments" is answerable in full even where the
    // split is not, and the card above the donut asks exactly that.
    expect(mapped.payments).toBe(56);

    /*
     * `credit` and `transfer` have no label in `console.dashCashier` and are
     * not folded into `card`: the figure under this donut is what the cashier
     * is counted against at close, and a credit sale added to the card total is
     * a variance nobody can explain.
     */
    expect(mapped.methods).toEqual([
      { id: 'card', amount: 148_200_000 },
      { id: 'cash', amount: 96_400_000 },
      { id: 'wallet', amount: 0 },
    ]);
  });

  it('prints the payment log to the minute, and marks a refund', async () => {
    const fixture = await getCashierOverview('today');

    const mapped = cashierFrom(
      payload({
        recent_payments: [
          {
            id: 512,
            at: '2026-08-22T13:42:00+05:00',
            order: 'A-1286',
            method: 'card',
            amount_tiyin: 7_400_000,
            refund: false,
          },
          {
            id: 509,
            at: '2026-08-22T12:51:00+05:00',
            order: 'A-1276',
            method: 'cash',
            amount_tiyin: 4_200_000,
            refund: true,
          },
          {
            id: 508,
            at: '2026-08-22T12:38:00+05:00',
            order: 'A-1274',
            method: 'credit',
            amount_tiyin: 3_100_000,
            refund: false,
          },
        ],
      }),
      fixture,
    );

    // Two rows, not three: the credit sale has no column here.
    expect(mapped.recent).toEqual([
      { id: '512', time: '13:42', order: 'A-1286', method: 'card', amount: 7_400_000 },
      {
        id: '509',
        time: '12:51',
        order: 'A-1276',
        method: 'cash',
        refund: true,
        amount: 4_200_000,
      },
    ]);
  });

  it('shows an empty log for a cashier who has taken nothing', async () => {
    const fixture = await getCashierOverview('today');

    /*
     * The block is present and empty, which is a real answer. Falling back to
     * the fixture's six payments here would be the only lie on the screen — and
     * the one a cashier would act on, because it is their own log.
     */
    expect(cashierFrom(payload({ recent_payments: [] }), fixture).recent).toEqual([]);
  });

  it('draws no drawer at all when no shift is open', async () => {
    const fixture = await getCashierOverview('today');

    /*
     * `shift: null` is a real answer — the drawer has not been opened yet — and
     * it used to return the fixture's 2 184 000 so'm. That is the single figure
     * on this platform where an invented value produces a real accusation: a
     * count against a balance nobody put there is short by exactly that much.
     */
    expect(cashierFrom(payload({ shift: null }), fixture).drawer).toBeNull();
    expect(cashierFrom(payload({ shift: null }), fixture).openingFloat).toBeNull();
  });

  it('reads the tables still waiting to pay', async () => {
    const fixture = await getCashierOverview('today');

    // Live since `RoleDashboards::tablesAwaiting()`. It was a constant three,
    // and it is the one figure on this screen a cashier can check by looking up.
    expect(cashierFrom(payload({ tables_awaiting: 2 }), fixture).tablesAwaiting).toBe(2);
    expect(cashierFrom(payload({ tables_awaiting: 0 }), fixture).tablesAwaiting).toBe(0);
  });

  it('claims nothing when nothing is answered', async () => {
    const fixture = await getCashierOverview('today');

    const mapped = cashierFrom(payload(), fixture);

    expect(mapped.live).toBe(true);
    expect(mapped.drawer).toBeNull();
    expect(mapped.openingFloat).toBeNull();
    expect(mapped.payments).toBeNull();
    expect(mapped.refunds).toBeNull();
    expect(mapped.tablesAwaiting).toBeNull();
    expect(mapped.recent).toEqual([]);
    expect(mapped.methods).toEqual([]);
  });
});

/* ---------------------------------------------------------- the accountant */

describe('accountantFrom — the business’s money', () => {
  it('reads the KPIs and six months of cash flow', async () => {
    const fixture = await getAccountantOverview('today');

    const mapped = accountantFrom(
      payload({
        kpis: [
          kpi('revenue', 51_200_000_000),
          kpi('expenses', 13_800_000_000),
          kpi('net_margin', 21.7, 'percent'),
        ],
        cashflow: [
          { month: '2026-03', inflow_tiyin: 51_200_000_000, outflow_tiyin: 43_100_000_000 },
          { month: '2026-11', inflow_tiyin: 62_400_000_000, outflow_tiyin: 50_100_000_000 },
        ],
      }),
      fixture,
    );

    expect(mapped.revenueMtd).toBe(51_200_000_000);
    expect(mapped.expenses).toBe(13_800_000_000);
    // A percentage keeps its decimal: 21.7 rounded to 22 is a different claim
    // about the business, and this card prints one decimal.
    expect(mapped.netMargin).toBe(21.7);

    expect(mapped.cashflow).toEqual([
      { id: '2026-03', label: 'Mar', inflow: 51_200_000_000, outflow: 43_100_000_000 },
      { id: '2026-11', label: 'Noy', inflow: 62_400_000_000, outflow: 50_100_000_000 },
    ]);
  });

  it('gives the ledger donut its four tenders, credit excluded', async () => {
    const fixture = await getAccountantOverview('today');

    const mapped = accountantFrom(
      payload({
        methods: [
          { method: 'transfer', amount_tiyin: 2_100_000_000, count: 14 },
          { method: 'card', amount_tiyin: 22_400_000_000, count: 812 },
        ],
      }),
      fixture,
    );

    expect(mapped.methods).toEqual([
      { id: 'card', amount: 22_400_000_000 },
      { id: 'cash', amount: 0 },
      { id: 'wallet', amount: 0 },
      { id: 'transfer', amount: 2_100_000_000 },
    ]);
  });

  it('passes a KPI the server cannot answer honestly straight through as null', async () => {
    const fixture = await getAccountantOverview('today');

    /*
     * `null` is the server saying "not this one" — `netMargin()` answers null
     * whenever gross profit is unknown, which is until a recipe is costed. Both
     * a zero and the fixture's 16.4% are claims; the card draws a dash.
     */
    const mapped = accountantFrom(payload({ kpis: [kpi('net_margin', null, 'percent')] }), fixture);

    expect(mapped.netMargin).toBeNull();
  });

  it('claims nothing when nothing is answered', async () => {
    const fixture = await getAccountantOverview('today');

    const mapped = accountantFrom(payload(), fixture);

    expect(mapped.live).toBe(true);
    expect(mapped.revenueMtd).toBeNull();
    expect(mapped.expenses).toBeNull();
    expect(mapped.netMargin).toBeNull();
    // A budget is a plan; nothing in a ledger knows what somebody meant to
    // spend, and the fixture's 168m was measured against a business earning
    // nothing.
    expect(mapped.expenseBudget).toBeNull();
    // Invoices are Suppliers' question, one module along.
    expect(mapped.unpaidInvoices).toBeNull();
    expect(mapped.overdueInvoices).toBeNull();
    expect(mapped.upcoming).toEqual([]);
    expect(mapped.taxes).toEqual([]);
  });

  it('lets an empty cash-flow chart through', async () => {
    const fixture = await getAccountantOverview('today');

    // Six months of invented trading was what a business with no ledger read
    // here. `peakOf()` in `accountant.tsx` is what makes the empty case drawable.
    expect(accountantFrom(payload({ cashflow: [] }), fixture).cashflow).toEqual([]);
  });
});

/* ----------------------------------------------------------- the warehouse */

describe('warehouseFrom — the shelf', () => {
  it('takes all four stock states from one block', async () => {
    const fixture = await getWarehouseOverview(null, 'today');

    const mapped = warehouseFrom(
      payload({
        stock: { ok: 96, low: 7, out: 3, expiring: 11 },
        waste_percent: 2.6,
      }),
      fixture,
    );

    expect(mapped.stock).toEqual({ ok: 96, low: 7, out: 3, expiring: 11 });
    // The two cards above the donut must not disagree with the donut itself.
    expect(mapped.lowStock).toBe(7);
    expect(mapped.expiring).toBe(11);
    expect(mapped.wastePercent).toBe(2.6);
  });

  it('ranks consumption by cost and keeps each line’s own unit', async () => {
    const fixture = await getWarehouseOverview(null, 'today');

    const mapped = warehouseFrom(
      payload({
        consumed: [
          { id: 4, name: "Mol go'shti", quantity: 84, unit: 'kg', cost_tiyin: 756_000_000 },
          { id: 9, name: 'Paxta moyi', quantity: 38, unit: 'L', cost_tiyin: 189_000_000 },
          { id: 12, name: 'Tuxum', quantity: 240, unit: 'piece', cost_tiyin: 0 },
        ],
      }),
      fixture,
    );

    expect(mapped.consumed).toEqual([
      { id: '4', name: "Mol go'shti", quantity: 84, unit: 'kg', cost: 756_000_000, share: 1 },
      { id: '9', name: 'Paxta moyi', quantity: 38, unit: 'l', cost: 189_000_000, share: 0.25 },
      /*
       * An unrecognised unit reads as pieces, which is the safe direction: a
       * count is unit-free, so "240 dona" of something sold by weight is merely
       * coarse — where "240 kg" of eggs states a weight nobody recorded.
       */
      { id: '12', name: 'Tuxum', quantity: 240, unit: 'dona', cost: 0, share: 0 },
    ]);
  });

  it('claims nothing when nothing is answered', async () => {
    const fixture = await getWarehouseOverview(null, 'today');

    const mapped = warehouseFrom(payload(), fixture);

    expect(mapped.live).toBe(true);
    expect(mapped.lowStock).toBeNull();
    expect(mapped.expiring).toBeNull();
    expect(mapped.wastePercent).toBeNull();
    expect(mapped.stock).toBeNull();
    expect(mapped.consumed).toEqual([]);

    /*
     * Deliveries are a Suppliers receipt and never on this payload. The two
     * counts and the table go together — the KPI card divides one by the other
     * — and they go as null and empty, not as four scheduled deliveries from
     * suppliers this restaurant has never dealt with, one flagged late.
     */
    const partial = warehouseFrom(
      payload({ stock: { ok: 1, low: 0, out: 0, expiring: 0 } }),
      fixture,
    );
    expect(partial.deliveriesToday).toBeNull();
    expect(partial.deliveriesAccepted).toBeNull();
    expect(partial.incoming).toEqual([]);
  });
});

/* -------------------------------------------------------------- the waiter */

describe('waiterFrom — one person’s own shift', () => {
  it('reads their four figures and the orders still moving', async () => {
    const fixture = await getWaiterOverview('today');

    const mapped = waiterFrom(
      payload({
        kpis: [
          kpi('orders', 17, 'count'),
          kpi('guests', 49, 'count'),
          kpi('revenue', 214_800_000),
          kpi('average_cheque', 12_635_294),
        ],
        open_orders: 5,
        orders: [
          {
            number: 'A-1291',
            table: '12',
            status: 'cooking',
            items: 9,
            total_tiyin: 40_200_000,
            minutes_ago: 6,
          },
          {
            number: 'A-1279',
            table: null,
            status: 'topay',
            items: 3,
            total_tiyin: 8_600_000,
            minutes_ago: 22,
          },
        ],
      }),
      fixture,
    );

    expect(mapped.myOrders).toBe(17);
    expect(mapped.openOrders).toBe(5);
    expect(mapped.covers).toBe(49);
    expect(mapped.sales).toBe(214_800_000);
    expect(mapped.averageTicket).toBe(12_635_294);

    expect(mapped.orders).toEqual([
      { id: 'A-1291', table: '12', status: 'cooking', items: 9, total: 40_200_000, minutesAgo: 6 },
      // The ladder's `topay` is this screen's `to_pay`, and a takeaway ticket
      // with no table gets an em dash rather than a blank cell.
      { id: 'A-1279', table: '—', status: 'to_pay', items: 3, total: 8_600_000, minutesAgo: 22 },
    ]);
  });

  it('leaves a voided ticket off rather than drawing it as paid', async () => {
    const fixture = await getWaiterOverview('today');

    const mapped = waiterFrom(
      payload({
        orders: [
          {
            number: 'A-1288',
            table: '7',
            status: 'served',
            items: 8,
            total_tiyin: 31_800_000,
            minutes_ago: 26,
          },
          {
            number: 'A-1287',
            table: '4',
            status: 'voided',
            items: 2,
            total_tiyin: 4_000_000,
            minutes_ago: 31,
          },
        ],
      }),
      fixture,
    );

    /*
     * `voided`, `refunded` and `comped` have no word in this screen's six, and
     * folding them into the nearest one would tell a reader money came in for
     * food that was cancelled. A gap in a sample of recent tickets is visible;
     * a mislabelled row is not.
     */
    expect(mapped.orders.map((order) => order.id)).toEqual(['A-1288']);
    expect(mapped.orders[0]?.status).toBe('ready');
  });

  it('ranks their own top sellers by units, not by revenue', async () => {
    const fixture = await getWaiterOverview('today');

    const mapped = waiterFrom(
      payload({
        top_items: [
          { sku: 'osh', title: 'Osh, beef', sold: 12, revenue_tiyin: 50_400_000 },
          { sku: 'ayron', title: 'Ayron', sold: 3, revenue_tiyin: 900_000 },
        ],
      }),
      fixture,
    );

    expect(mapped.topSellers).toEqual([
      { id: 'osh', name: 'Osh, beef', units: 12, share: 1 },
      { id: 'ayron', name: 'Ayron', units: 3, share: 0.25 },
    ]);
  });

  it('hands over no floor plan, because this payload has neither side of the join', async () => {
    const fixture = await getWaiterOverview('today');

    const mapped = waiterFrom(payload({ open_orders: 2 }), fixture);

    /*
     * Which tables are theirs is the floor plan joined to their own open bills,
     * and neither is here. Six sample tables with running bills sent a waiter
     * across the room to a table that does not exist and does not owe 318 000.
     */
    expect(mapped.tables).toEqual([]);
    expect(mapped.openOrders).toBe(2);
  });

  it('claims nothing when nothing is answered', async () => {
    const fixture = await getWaiterOverview('today');

    const mapped = waiterFrom(payload(), fixture);

    expect(mapped.live).toBe(true);
    expect(mapped.myOrders).toBeNull();
    expect(mapped.covers).toBeNull();
    expect(mapped.sales).toBeNull();
    expect(mapped.averageTicket).toBeNull();
    expect(mapped.tables).toEqual([]);
    expect(mapped.orders).toEqual([]);
    expect(mapped.topSellers).toEqual([]);
  });
});

/* ------------------------------------------------------------ the operator */

describe('operatorFrom — the intake desk', () => {
  it('reads the counts it can and scores them against no target at all', async () => {
    const fixture = await getOperatorOverview('today');

    const mapped = operatorFrom(
      payload({
        kpis: [kpi('orders', 112, 'count'), kpi('average_cheque', 19_400_000)],
        declined: 6,
        open_orders: 3,
      }),
      fixture,
    );

    expect(mapped.taken).toBe(112);
    expect(mapped.averageOrder).toBe(19_400_000);
    expect(mapped.declined).toBe(6);
    // What the headline and the CTA claim is waiting, which was the literal 4.
    expect(mapped.queue).toBe(3);

    // A target is a policy somebody set, not a total anything produced, and
    // nowhere on this platform has one been set.
    expect(mapped.takenTarget).toBeNull();
    expect(mapped.averageOrderTarget).toBeNull();
    expect(mapped.declinedLimit).toBeNull();

    /*
     * Time to answer is what this desk is judged on, and it lives in a
     * telephony log the platform does not have. The card is not drawn rather
     * than filled: `0:38 · −0:07` was the same on every tenant every day.
     */
    expect(mapped.answer).toBeNull();
    expect(mapped.answerSeconds).toBeNull();
    expect(mapped.answerTargetSeconds).toBeNull();
  });

  it('reads the door each order came through, and drops one it cannot name', async () => {
    const fixture = await getOperatorOverview('today');

    const mapped = operatorFrom(
      payload({
        /*
         * `channels` is how an order was *fulfilled* and must not reach this
         * panel: splitting `aggregator` across Yandex and Uzum would invent
         * exactly the split the panel exists to show. `intake_channels` is the
         * group-by on the column that records the door.
         */
        channels: [{ channel: 'aggregator', orders_count: 27, revenue_tiyin: 500_000_000 }],
        intake_channels: [
          { channel: 'phone', orders_count: 31, revenue_tiyin: 510_000_000 },
          { channel: 'yandex', orders_count: 18, revenue_tiyin: 340_000_000 },
          // A lane with rows on the server and no key on this panel. Adding it
          // to Yandex's would misstate the comparison an operator acts on.
          { channel: 'wolt', orders_count: 4, revenue_tiyin: 60_000_000 },
        ],
      }),
      fixture,
    );

    expect(mapped.channels).toEqual([
      { key: 'phone', orders: 31, revenue: 510_000_000 },
      { key: 'yandex', orders: 18, revenue: 340_000_000 },
    ]);
  });

  it('takes the second half of a whole day for a noon-to-midnight chart', async () => {
    const fixture = await getOperatorOverview('today');

    const wholeDay = Array.from({ length: 24 }, (_, hour) => hour);

    expect(operatorFrom(payload({ hourly: wholeDay }), fixture).hourly).toEqual([
      12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    ]);

    // Twelve is already this window.
    const shift = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
    expect(operatorFrom(payload({ hourly: shift }), fixture).hourly).toEqual(shift);

    /*
     * Any other length is a window whose bars cannot be labelled —
     * `hourLabel()` prints `12 + index` and would name hours that do not exist.
     */
    expect(operatorFrom(payload({ hourly: [1, 2, 3] }), fixture).hourly).toEqual([]);
  });

  it('colours a late order by why it is late, not by how late', async () => {
    const fixture = await getOperatorOverview('today');

    const mapped = operatorFrom(
      payload({
        late: [
          {
            number: '#4824',
            where: 'Uzum Tezkor · Sergeli',
            minutes_late: 12,
            reason: 'no_courier',
          },
          { number: '#4818', where: 'Sayt · Yunusobod', minutes_late: 4, reason: 'en_route' },
        ],
      }),
      fixture,
    );

    /*
     * An order nobody is carrying gets worse on its own; one in transit is
     * being dealt with. The design's own three rows split exactly this way.
     * Seconds are printed as `:00` because whole minutes are all the payload
     * carries — `+12:04` in the fixture is the design's figure, not a precision
     * this endpoint has.
     */
    expect(mapped.late).toEqual([
      {
        order: '#4824',
        where: 'Uzum Tezkor · Sergeli',
        late: '+12:00',
        reason: 'noCourier',
        severity: 'danger',
      },
      {
        order: '#4818',
        where: 'Sayt · Yunusobod',
        late: '+4:00',
        reason: 'onTheWay',
        severity: 'warning',
      },
    ]);
  });

  it('claims nothing when nothing is answered', async () => {
    const fixture = await getOperatorOverview('today');

    const mapped = operatorFrom(payload(), fixture);

    expect(mapped.live).toBe(true);
    expect(mapped.taken).toBeNull();
    expect(mapped.averageOrder).toBeNull();
    expect(mapped.queue).toBeNull();
    expect(mapped.channels).toEqual([]);
    expect(mapped.hourly).toEqual([]);
    expect(mapped.late).toEqual([]);
    expect(mapped.top).toEqual([]);
  });
});

/* ---------------------------------------------------------- the dispatcher */

describe('dashboardFrom — one payload, the right shape', () => {
  it('hands each role its own overview', async () => {
    const [manager, cashier, accountant, warehouse, waiter, operator] = await Promise.all([
      getManagerOverview(null, 'today'),
      getCashierOverview('today'),
      getAccountantOverview('today'),
      getWarehouseOverview(null, 'today'),
      getWaiterOverview('today'),
      getOperatorOverview('today'),
    ]);

    expect(dashboardFrom('manager', payload({ open_orders: 7 }), manager).openOrders).toBe(7);
    expect(dashboardFrom('cashier', payload({ refunds: 3 }), cashier).refunds).toBe(3);
    expect(
      dashboardFrom('accountant', payload({ kpis: [kpi('revenue', 9_000)] }), accountant)
        .revenueMtd,
    ).toBe(9_000);
    expect(
      dashboardFrom(
        'warehouse',
        payload({ stock: { ok: 1, low: 2, out: 3, expiring: 4 } }),
        warehouse,
      ).lowStock,
    ).toBe(2);
    expect(dashboardFrom('waiter', payload({ open_orders: 2 }), waiter).openOrders).toBe(2);
    expect(dashboardFrom('operator', payload({ declined: 8 }), operator).declined).toBe(8);
  });

  it('dispatches on the role the screen asked for, not the one the payload names', async () => {
    const fixture = await getCashierOverview('today');

    /*
     * A server answering with a different role than the one requested has
     * changed its mind about who is reading, and drawing the shape it named
     * would hand a cashier somebody else's panels. The screen knows which
     * panels it has; the API scopes by permission per request regardless.
     */
    const mapped = dashboardFrom('cashier', payload({ role: 'manager', refunds: 4 }), fixture);

    expect(mapped.refunds).toBe(4);
    // No shift on the payload, so no drawer figure — never the fixture's.
    expect(mapped.drawer).toBeNull();
  });
});

/* ------------------------------------- the four blocks that were left empty */

/**
 * Each of these panels drew an empty state on a live tenant with a paragraph
 * saying which module the answer lived in. Four new contract methods later they
 * can be drawn, and what has to be asserted is not that they are populated —
 * it is the judgement each mapper makes about what NOT to draw.
 */
describe('stationsFrom — the manager’s station bars', () => {
  it('draws a bar per section, with the section’s own target beside it', async () => {
    const fixture = await getManagerOverview(null, 'today');

    const mapped = managerFrom(
      payload({
        stations: [
          { station: 'grill', open: 3, average_minutes: 18, target_minutes: 12 },
          { station: 'cold', open: 0, average_minutes: 4, target_minutes: 6 },
        ],
      }),
      fixture,
    );

    expect(mapped.stations).toEqual([
      { id: 'grill', minutes: 18, target: 12 },
      { id: 'cold', minutes: 4, target: 6 },
    ]);
  });

  it('drops a section that has finished nothing rather than drawing it at zero', async () => {
    const fixture = await getManagerOverview(null, 'today');

    // A zero bar beside a full one reads as "the cold section is instant",
    // which is the opposite of "the cold section is idle".
    const mapped = managerFrom(
      payload({
        stations: [
          { station: 'grill', open: 0, average_minutes: null, target_minutes: 12 },
          { station: 'bar', open: 1, average_minutes: 2, target_minutes: 4 },
        ],
      }),
      fixture,
    );

    expect(mapped.stations).toEqual([{ id: 'bar', minutes: 2, target: 4 }]);
  });

  it('drops a section the design’s chart has no bar for', async () => {
    const fixture = await getManagerOverview(null, 'today');

    // Folding pastry's minutes into the cold section would misstate the one
    // comparison this panel exists to make.
    const mapped = managerFrom(
      payload({
        stations: [{ station: 'pastry', open: 2, average_minutes: 9, target_minutes: 8 }],
      }),
      fixture,
    );

    expect(mapped.stations).toEqual([]);
  });
});

describe('incomingFrom — the storekeeper’s vans', () => {
  const delivery = {
    id: 4,
    number: 'PO-0004',
    supplier: 'Anhor Meat',
    lines: 6,
    expected_at: '2026-08-22T09:00:00+00:00',
    expected_time: '14:00',
    received_at: null,
    total_tiyin: 1_200_000_00,
  };

  it('reads the hour off the API rather than deriving it from the instant', async () => {
    const fixture = await getWarehouseOverview(null, 'today');

    // Every timestamp leaves the API in UTC and only the server knows the
    // restaurant's hours: 09:00Z is 14:00 in the dining room, and a browser
    // slicing the ISO string would be five hours early on every row.
    const mapped = warehouseFrom(
      payload({ deliveries: [delivery] }),
      fixture,
      new Date('2026-08-22T08:00:00Z'),
    );

    expect(mapped.incoming[0]?.time).toBe('14:00');
    expect(mapped.incoming[0]?.supplier).toBe('Anhor Meat');
    expect(mapped.incoming[0]?.items).toBe(6);
  });

  it('calls a van late once its due time has passed, and accepted once it arrives', async () => {
    const fixture = await getWarehouseOverview(null, 'today');

    const late = warehouseFrom(
      payload({ deliveries: [delivery] }),
      fixture,
      new Date('2026-08-22T10:00:00Z'),
    );
    const arrived = warehouseFrom(
      payload({ deliveries: [{ ...delivery, received_at: '2026-08-22T10:30:00+00:00' }] }),
      fixture,
      new Date('2026-08-22T11:00:00Z'),
    );

    expect(late.incoming[0]?.status).toBe('late');
    // Accepted whenever it was due: a van that arrived is not still late.
    expect(arrived.incoming[0]?.status).toBe('accepted');
  });

  it('never calls a delivery late when nobody agreed a time', async () => {
    const fixture = await getWarehouseOverview(null, 'today');

    const mapped = warehouseFrom(
      payload({ deliveries: [{ ...delivery, expected_at: null, expected_time: null }] }),
      fixture,
      new Date('2030-01-01T00:00:00Z'),
    );

    expect(mapped.incoming[0]?.status).toBe('onWay');
    expect(mapped.incoming[0]?.time).toBe('—');
  });

  it('keeps the two delivery counts together, because one divides the other', async () => {
    const fixture = await getWarehouseOverview(null, 'today');

    const both = warehouseFrom(
      payload({ deliveries_expected: 3, deliveries_accepted: 1 }),
      fixture,
    );
    const neither = warehouseFrom(payload({}), fixture);

    expect([both.deliveriesToday, both.deliveriesAccepted]).toEqual([3, 1]);
    // "1 of 0" is the reading a half-answered pair would produce.
    expect([neither.deliveriesToday, neither.deliveriesAccepted]).toEqual([null, null]);
  });
});

describe('upcomingFrom — what the accountant owes next', () => {
  const payable = {
    id: 11,
    number: 'PO-0011',
    supplier: 'Anhor Meat',
    amount_tiyin: 500_000_00,
    due_at: '2026-08-25T00:00:00+00:00',
    due_in_days: 3,
  };

  it('takes the countdown from the server rather than subtracting two instants', async () => {
    const fixture = await getAccountantOverview('today');

    // A day boundary needs a timezone and the console has none: derived here,
    // "due in three days" would flip to two at seven in the evening Tashkent
    // time, for a deadline that had not moved.
    const mapped = accountantFrom(payload({ upcoming: [payable] }), fixture);

    expect(mapped.upcoming[0]?.daysUntilDue).toBe(3);
    expect(mapped.upcoming[0]?.amount).toBe(500_000_00);
    expect(mapped.upcoming[0]?.supplier).toBe('Anhor Meat');
  });

  it('goes negative once the deadline has passed, which is the whole signal', async () => {
    const fixture = await getAccountantOverview('today');

    const mapped = accountantFrom(
      payload({ upcoming: [{ ...payable, due_in_days: -7 }] }),
      fixture,
    );

    expect(mapped.upcoming[0]?.daysUntilDue).toBe(-7);
  });

  it('drops a debt with no deadline rather than dating it today', async () => {
    const fixture = await getAccountantOverview('today');

    // A delivery that has not arrived has not started its terms. Placing it at
    // the top of a list ordered by urgency would push a real deadline down.
    const mapped = accountantFrom(
      payload({ upcoming: [{ ...payable, due_at: null, due_in_days: null }] }),
      fixture,
    );

    expect(mapped.upcoming).toEqual([]);
  });

  it('reads the budget as a plan, and no budget as a dash rather than a zero', async () => {
    const fixture = await getAccountantOverview('today');

    expect(
      accountantFrom(payload({ expense_budget_tiyin: 168_000_000_00 }), fixture).expenseBudget,
    ).toBe(168_000_000_00);
    // Zero would draw a bar reporting every som spent as an overspend.
    expect(accountantFrom(payload({}), fixture).expenseBudget).toBeNull();
    expect(
      accountantFrom(payload({ unpaid_invoices: 4, overdue_invoices: 1 }), fixture),
    ).toMatchObject({ unpaidInvoices: 4, overdueInvoices: 1 });
  });
});

describe('myTablesFrom — a waiter’s own section', () => {
  const table = {
    id: 7,
    label: 'A-1',
    seats: 4,
    kind: 'regular',
    zone: 'Asosiy zal',
    status: 'occupied',
    since: '2026-08-22T05:44:00+00:00',
    since_time: '10:44',
    bill_tiyin: 318_000_00,
    guests: 3,
  };

  it('draws the table with the bill running on it, on the venue’s own clock', async () => {
    const fixture = await getWaiterOverview('today');

    const mapped = waiterFrom(payload({ tables: [table] }), fixture);

    expect(mapped.tables).toEqual([
      {
        id: '7',
        number: 'A-1',
        zone: 'main',
        seats: 4,
        status: 'seated',
        since: '10:44',
        bill: 318_000_00,
        guests: 3,
      },
    ]);
  });

  it('keeps a claimed empty table, which is the one the waiter is meant to fill', async () => {
    const fixture = await getWaiterOverview('today');

    const mapped = waiterFrom(
      payload({
        tables: [
          {
            ...table,
            status: 'free',
            since: null,
            since_time: null,
            bill_tiyin: null,
            guests: null,
          },
        ],
      }),
      fixture,
    );

    expect(mapped.tables[0]?.status).toBe('free');
    expect(mapped.tables[0]?.bill).toBeNull();
  });

  it('groups by the table’s kind, never by whatever the hall is called', async () => {
    const fixture = await getWaiterOverview('today');

    // A restaurant naming its rooms "2-zal" or "Yozgi maydon" must not lose
    // every table to a fallback zone.
    const mapped = waiterFrom(
      payload({
        tables: [
          { ...table, id: 1, kind: 'terrace', zone: 'Yozgi maydon' },
          { ...table, id: 2, kind: 'vip', zone: '2-zal' },
          { ...table, id: 3, kind: 'bar', zone: null },
        ],
      }),
      fixture,
    );

    expect(mapped.tables.map((row) => row.zone)).toEqual(['terrace', 'vip', 'main']);
  });

  it('drops a state the floor plan has no word for rather than defaulting it', async () => {
    const fixture = await getWaiterOverview('today');

    // A table drawn free that is not is a table the host gives away.
    const mapped = waiterFrom(payload({ tables: [{ ...table, status: 'quarantined' }] }), fixture);

    expect(mapped.tables).toEqual([]);
  });
});
