import { apiGet } from '@/lib/api-server';
import { getSession } from '@/lib/session';

import { ORDER_STATUS } from '../orders/orders-server';

/*
 * The payload types live next door, with the six mappings that read the same
 * envelope. One endpoint answering seven shapes described in two places is one
 * description drifting: a key renamed for the manager and not for the owner
 * compiles cleanly on both sides and fails only in the browser.
 */
import type { ApiAttention, ApiDashboard, ApiKpi, ApiOrderRow } from './dashboard-map';
import {
  getOverview,
  type Attention,
  type AttentionKey,
  type BranchRow,
  type HourPoint,
  type Kpi,
  type KpiKey,
  type Lede,
  type Overview,
  type Period,
  type RecentOrder,
  type TopProduct,
} from './overview-data';

/**
 * The home screen, from the API.
 *
 * Server half of ./overview-data.ts, which has said since it was written that
 * `getOverview()` is "where the backend plugs in". This is that plug: the types
 * are unchanged, the page is unchanged, and the fixture stays exactly where it
 * was so a console with no session still renders the design's own figures.
 *
 * ---------------------------------------------------------------------------
 * One request, and it carries the role
 *
 * `GET /api/v1/dashboard?role=` returns a different SHAPE per role because the
 * five dashboards ask genuinely different questions — an owner wants five
 * venues compared, a cashier wants one drawer. The role comes off the session
 * rather than from the caller: a client that named its own role would be a
 * client choosing which figures it is shown, and the API scopes by permission
 * regardless.
 *
 * ---------------------------------------------------------------------------
 * What is still the fixture, and why it says so
 *
 * `recentOrders` used to be listed here: the endpoint did not carry it and the
 * panel kept its sample rows. It does now — `RoleDashboards::recentOrders()`
 * answers the last eight bills — and `recentFrom()` below draws them through
 * the same status map the Orders screen uses, so a bill reads the same on
 * both screens.
 *
 * `attention` used to be listed here too, on the grounds that the rules engine
 * behind it did not exist. It does now: `RoleDashboards::attention()` answers
 * four rules over figures already on this response, and `attentionFrom()` below
 * draws them. The rules engine that is still missing is the *forecasting* one —
 * "beef runs out at 19:00" needs recipe consumption against stock — which is
 * why the fixture's own two cards say more than any live card can.
 */

/**
 * The five figures the design's KPI row draws, in its order.
 *
 * The API answers six for an owner (it adds food cost) and four for a cashier.
 * Mapping rather than rendering whatever arrives keeps the row at five cards
 * with the design's own colour alternation — a row whose length changed with
 * the reader's role would reflow into a different grid on every screen.
 */
const RAIL: Record<KpiKey, string> = {
  revenue: 'var(--brand-500)',
  orders: 'var(--accent-500)',
  average_cheque: 'var(--brand-500)',
  gross_profit: 'var(--accent-500)',
  expenses: 'var(--warning-500)',
};

/** Which server key feeds which card. */
const SOURCE: Record<KpiKey, string> = {
  revenue: 'revenue',
  orders: 'orders',
  average_cheque: 'average_cheque',
  /*
   * Gross profit is revenue minus cost of goods, and cost of goods is the food
   * cost the summary already computes — but only over the dishes that have a
   * recipe. The server publishes the card with `value: null` until the recipe
   * cards are complete, because a gross profit derived from a partial cost
   * base would overstate it by exactly the share of the menu nobody has
   * costed yet — the number an owner is least able to check. A null value
   * draws a dash; it used to draw the fixture's figure beside five live ones.
   */
  gross_profit: 'gross_profit',
  expenses: 'expenses',
};

function kpisFrom(api: ApiKpi[], fallback: readonly Kpi[]): Kpi[] {
  const byKey = new Map(api.map((kpi) => [kpi.key, kpi]));

  return fallback.map((card) => {
    const live = byKey.get(SOURCE[card.key]);

    /*
     * The server did not answer this card at all — a key it does not compute
     * for this role, or one it dropped. A dash, exactly as for a `null` value
     * below: the alternative was the design's 18 420 000 so'm with a green
     * `+12.4%` sitting in the same row as real zeroes, indistinguishable.
     */
    if (live === undefined) return { ...card, value: null, delta: null, attainment: null };

    // It answered, and would not vouch for a number. A dash, not a sample.
    if (live.value === null) return { ...card, value: null, delta: null, attainment: null };

    return {
      key: card.key,
      value: Math.round(live.value),
      unit: card.unit,
      delta:
        live.delta_percent === null
          ? null
          : {
              // A leading sign, and the minus is U+2212 rather than a hyphen —
              // the design sets its figures in a font whose hyphen is a third
              // the width of its minus, and a mixed column looks misaligned.
              text: `${live.delta_percent >= 0 ? '+' : '−'}${Math.abs(live.delta_percent)}%`,
              /*
               * `good` is the meaning, not the sign. Falling expenses are not a
               * win to celebrate in green — the design leaves that card in
               * muted ink whichever way it moved, because an owner reading a
               * green "expenses down" learns nothing about whether the kitchen
               * stopped buying or stopped cooking.
               */
              good: card.key === 'expenses' ? false : live.delta_percent >= 0,
            },
      // Attainment is progress against a target, and there are no targets in
      // the API yet. Null renders no rail, which is what the design specifies
      // for a KPI with nothing to measure against — a rail at an invented width
      // is worse than none.
      attainment: null,
      railColour: RAIL[card.key],
    };
  });
}

/**
 * The trading day, hour by hour.
 *
 * The design's chart is twelve bars, 09:00 to 20:00, each carrying today
 * against this weekday's average. Both lines are the server's now:
 * `SalesInsights` looks back over the last eight of this weekday and answers
 * `average_tiyin` per hour.
 *
 * It used to keep the fixture's curve for the comparison, and that made the
 * whole claim of the panel false — the thing being compared against was the
 * demo restaurant's Tuesday. So the rule that replaced it stays: the baseline
 * is drawn only where the server sent one. It is null for an hour this weekday
 * has never traded in, null for a restaurant with no history, and null for any
 * window longer than a day, because a one-day average under a seven-day bar
 * would report the restaurant beating itself by 600% every week.
 *
 * `?? null` rather than `?? 0` on the lookup, and the two are not
 * interchangeable: a flat zero baseline under today's curve reads as a
 * record-breaking day at every hour of it.
 */
function hoursFrom(
  api: NonNullable<ApiDashboard['hours']>,
  fallback: readonly HourPoint[],
): HourPoint[] {
  const byHour = new Map(api.map((point) => [point.hour, point]));

  return fallback.map((point) => {
    const live = byHour.get(Number(point.hour));

    return {
      hour: point.hour,
      today: live?.revenue_tiyin ?? 0,
      average: live?.average_tiyin ?? null,
    };
  });
}

function topFrom(api: NonNullable<ApiDashboard['top_items']>): TopProduct[] {
  const best = Math.max(...api.map((item) => item.revenue_tiyin), 1);

  return api.map((item) => ({
    id: item.sku,
    name: item.title,
    units: item.sold,
    revenue: item.revenue_tiyin,
    // The width of the little bar: this line against the best-selling one.
    share: item.revenue_tiyin / best,
  }));
}

/**
 * The keys this console can word, and where each one sends the reader.
 *
 * The href arrives on the payload as well, and it is deliberately not used.
 * A link target taken from a response is a link target the API can change
 * under a screen that has no such route — `/staff/shifts` is this console's
 * spelling of the rota and nothing upstream should have a vote on it. The
 * server's own hrefs and these agree today; if they ever stop, the console
 * keeps working and the mismatch is a one-line fix here.
 */
const ATTENTION: Readonly<Record<string, { key: AttentionKey; href: string }>> = {
  food_cost: { key: 'food_cost', href: '/analytics' },
  labour_cost: { key: 'labour_cost', href: '/staff/shifts' },
  stock_out: { key: 'stock_out', href: '/inventory' },
  stock_low: { key: 'stock_low', href: '/inventory' },
  void_rate: { key: 'void_rate', href: '/analytics' },
};

/**
 * What needs a decision today, from the four rules the server runs.
 *
 * Three things this does not do, and each is the reason the panel can be
 * trusted at all:
 *
 *   It does not fall back to the fixture when the list is **empty**. An empty
 *   `attention` is an answer — nothing is over its threshold — and showing two
 *   sample warnings instead would teach an owner that the panel is decorative.
 *   `undefined` (the block was not computed for this role) is the case that
 *   keeps the fixture; `[]` renders the "nothing open" line.
 *
 *   It does not word a key it does not recognise. A rule added upstream reaches
 *   this console before the copy does, and a card with a blank title is worse
 *   than a card that is not there — the reader cannot tell whether it is a bug
 *   or a warning they failed to read.
 *
 *   It does not re-derive the level. `warn` against `note` is the server's
 *   judgement — an empty shelf outranks a low one — and a client re-ranking it
 *   would be a second opinion about the same figure.
 */
export function attentionFrom(
  api: ApiAttention[] | undefined,
  fixture: readonly Attention[],
): readonly Attention[] {
  if (api === undefined) return fixture;

  return api.flatMap((card): Attention[] => {
    const known = ATTENTION[card.key];

    if (known === undefined) return [];

    return [{ key: known.key, level: card.level, href: known.href }];
  });
}

function branchesFrom(api: NonNullable<ApiDashboard['branches']>): BranchRow[] {
  return api.map((branch, index) => ({
    id: branch.branch_id ?? -index - 1,
    name: branch.name ?? '—',
    revenue: branch.revenue_tiyin,
    // Per-branch change needs the previous window per branch, which the
    // endpoint does not group by. Zero draws no arrow rather than an invented
    // direction — a red −7% beside a venue that grew is worse than a blank.
    deltaPercent: 0,
  }));
}

export async function getOverviewLive(period: Period = 'today'): Promise<Overview> {
  const [fixture, session] = await Promise.all([getOverview(null, period), getSession()]);

  const answer = await apiGet<{ data?: ApiDashboard }>(
    `/dashboard?role=${encodeURIComponent(session.role.id)}&period=${period}`,
  );

  if (!answer?.data) return fixture;

  const { data } = answer;

  return {
    // The person's own name, from the session rather than the report: a
    // greeting is about who is reading, not about what was sold.
    greetingName: session.user.name.split(' ')[0] ?? fixture.greetingName,
    kpis: kpisFrom(data.kpis, fixture.kpis),
    /*
     * The API answered, so this is a live restaurant: whatever the payload
     * does not carry for this role is nothing, not the sample. A manager's
     * arm of `/dashboard` has no `branches`, and a phone reading the owner
     * overview under a manager session used to list the demo's five venues
     * and their takings in its place.
     */
    hours: data.hours ? hoursFrom(data.hours, fixture.hours) : hoursFrom([], fixture.hours),
    attention: attentionFrom(data.attention, []),
    topProducts: data.top_items ? topFrom(data.top_items) : [],
    branches: data.branches ? branchesFrom(data.branches) : [],
    recentOrders: recentFrom(data.recent_orders, []),
    lede: ledeFrom(data, session.placeName),
  };
}

/**
 * The last bills, as the design's rows.
 *
 * An EMPTY answer is an answer — `RoleDashboards::recentOrders()` returns `[]`
 * for a tenant with no bills — and the panel draws its empty state for it. It
 * used to keep the sample rows, with the reasoning written out: *"a restaurant
 * that has not traded yet is a restaurant being shown the product"*. What that
 * produced was five invented bills with money against them on the first screen
 * after login, linking to an Orders table where none of them exist.
 *
 * `undefined` — the block was not computed for this role — still keeps the
 * fixture, which is rule 1 in `./dashboard-map.ts`.
 */
function recentFrom(
  rows: readonly ApiOrderRow[] | undefined,
  fallback: readonly RecentOrder[],
): readonly RecentOrder[] {
  if (rows === undefined) return fallback;

  return rows.map((row) => ({
    id: row.number,
    where: row.where,
    status: ORDER_STATUS[row.status] ?? 'new',
    total: row.total_tiyin,
  }));
}

/**
 * What the line under the greeting can honestly say.
 *
 * The design's line — "Chilonzor is 12.4% ahead of yesterday. Two things need
 * attention today." — is two facts, and both are on this response: the
 * revenue KPI's delta against the previous period, and the attention cards.
 * Shipped as facts rather than as a sentence so `owner.tsx` can word them in
 * the reader's language; `null` is what a delta the server would not vouch
 * for becomes, and the sentence then drops its first half rather than
 * claiming a comparison nobody made.
 */
function ledeFrom(data: ApiDashboard, branch: string): Lede {
  const revenue = data.kpis.find((kpi) => kpi.key === 'revenue');

  return {
    branch,
    period: data.window.period,
    revenueDeltaPercent: revenue?.delta_percent ?? null,
    issues: data.attention?.length ?? 0,
  };
}
