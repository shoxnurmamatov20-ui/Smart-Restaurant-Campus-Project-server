import { apiGet } from '@/lib/api-server';

import { BRANCH_PERFORMANCE, type BranchPerformance } from './branches-data';

/**
 * Every venue side by side, from the one report that knows all nine columns.
 *
 * Server half of ./branches-data.ts, split per the house rule: the fixture and
 * the thresholds stay there, anything that calls the server is here.
 *
 * ---------------------------------------------------------------------------
 * One read now, where there used to be two and a half a screen
 *
 * This file read `GET /api/v1/branches` for the register and
 * `GET /api/v1/dashboard?role=owner` for the takings, and then filled six of
 * the nine columns with `null` because nothing on the platform published them
 * per branch. `GET /api/v1/analytics/branches?period=` replaces both. It reads
 * the register itself — so a venue closed for refurbishment still appears with
 * a zero rather than vanishing, which was the reason the register was read
 * separately — and it answers the six out of `analytics.daily_facts`.
 *
 * `period=month` because the screen's top panel compares each venue's takings
 * against its MONTHLY target. Asking for `today` and multiplying by thirty is
 * what this file used to do to the fixture, and it is a projection rather than
 * a measurement: it reports a venue that had one good Friday as on course for
 * the month.
 *
 * ---------------------------------------------------------------------------
 * Three columns can still come back as a dash, and only these three
 *
 * Margin and food cost are withheld when nothing sold in the window has a
 * costed recipe — the report says so through `cogs_coverage_percent`, and a
 * gross margin derived from an empty cost base reads as 100%, which is the
 * most flattering possible lie about a kitchen. Labour is withheld when the
 * projection carries no payroll for the window, for the reason the API states
 * about the same figure on the dashboard: a labour share of 0% and a labour
 * share nobody has computed look identical in a cell, and only one of them is
 * a reason to go and look at the rota.
 *
 * Everything else is a real number for every venue, including the ones that
 * took nothing: revenue, orders, headcount, alerts and the delta are all
 * meaningful at zero.
 */
export type BranchRow = {
  id: string;
  name: string;
  /** The catalogue key when the city is one the console has a word for. */
  cityKey: BranchPerformance['city'] | null;
  /** What the API stores, shown when there is no catalogue key. */
  cityLabel: string | null;
  /** Takings over the window, in tiyin. */
  revenue: number;
  orders: number;
  averageOrder: number;
  /** `null` when nothing sold in the window has a costed recipe — see above. */
  margin: number | null;
  /** `null` when the projection carries no payroll for the window. */
  labour: number | null;
  foodCost: number | null;
  staff: number | null;
  openAlerts: number | null;
  deltaPercent: number | null;
  /** This month's target, in tiyin. 0 when the venue has never been given one. */
  targetTiyin: number;
  /** What this venue charges to deliver — the keys the order endpoint reads. */
  delivery: DeliveryTerms;
};

/** One bar of the labour curve. */
export type LabourHour = {
  hour: number;
  labourTiyin: number;
  revenueTiyin: number;
  /** Labour as a share of that hour's takings — `null` when it took nothing. */
  percent: number | null;
};

export type LabourCurve = {
  hours: readonly LabourHour[];
  /** Labour over the whole window as a share of its takings, or `null`. */
  sharePercent: number | null;
  /**
   * How many hours cost more than a third of what they took.
   *
   * The design's "overstaffed hours" figure. 35% is the threshold its own bars
   * are coloured at, so the count and the colours cannot disagree.
   */
  overstaffed: number;
};

export type BranchesScreen = {
  rows: readonly BranchRow[];
  /**
   * The rota against the takings, hour by hour — or `null`.
   *
   * Null on three different facts and all three mean "do not draw the chart":
   * the read did not answer, the Staff module has no attendance for the window
   * (`has_labour`), or nobody was at work. The design's fourteen bars used to
   * be drawn from `branches-data.ts` beside real revenue and real staff counts,
   * under a caption telling a manager to cut shifts.
   */
  labour: LabourCurve | null;
  /** False when this render is the fixture rather than the restaurant's own venues. */
  live: boolean;
};

/** One hour of `GET /api/v1/analytics/labour-by-hour`. */
type ApiLabourHour = {
  hour: number;
  labour_tiyin: number;
  revenue_tiyin: number;
  labour_percent: number | null;
};

type ApiLabour = {
  data: {
    has_labour: boolean;
    labour_percent: number | null;
    hours: ApiLabourHour[];
  };
};

/**
 * One venue as `GET /api/v1/analytics/branches` answers it.
 *
 * Every percentage is a whole integer of that branch's OWN revenue, and every
 * money figure is integer tiyin — the same contract as the fixture, so nothing
 * between here and the screen has to know which of the two it is drawing.
 */
type ApiVenue = {
  branch_id: number;
  name: string;
  city: string | null;
  revenue_tiyin: number;
  orders_count: number;
  average_cheque_tiyin: number;
  margin_percent: number;
  food_cost_percent: number;
  /** What share of the window's sales came from dishes with a costed recipe. */
  cogs_coverage_percent: number;
  labour_percent: number;
  staff_count: number;
  open_alerts: number;
  delta_percent: number;
  target_monthly_tiyin: number;
};

/** The two cities the console has a word for, by what the column holds. */
const CITY_KEYS: Readonly<Record<string, BranchPerformance['city']>> = {
  tashkent: 'tashkent',
  toshkent: 'tashkent',
  ташкент: 'tashkent',
  termiz: 'termiz',
  termez: 'termiz',
  термез: 'termiz',
};

/** `GET /api/v1/branches` — the venue's own document, settings included. */
type ApiBranchRow = {
  id: number;
  settings?: Record<string, unknown> | null;
};

/**
 * What a venue charges to deliver, as the order endpoint reads it.
 *
 * The three keys are `PublicOrderController`'s own — `delivery_fee_tiyin`,
 * `free_delivery_over_tiyin`, `min_order_tiyin` — and not the dotted variants
 * the public branch list used to quote from. That drift meant a restaurant
 * could not set a delivery fee at all: the settings schema dropped the
 * undeclared path on write, the storefront quoted zero, and the bill charged
 * whatever was on the row.
 */
export type DeliveryTerms = {
  feeTiyin: number;
  freeOverTiyin: number;
  minimumTiyin: number;
  /**
   * What this venue promises, in minutes — the two halves the kitchen and the
   * road contribute to `PublicOrderController::etaMinutes()`.
   *
   * They were read from paths the settings schema did not declare, so every
   * kitchen in the country promised the same 10 + 25 the method defaults to. A
   * venue two streets from its customers and one across a city cannot honestly
   * quote the same number.
   */
  kitchenMinutes: number;
  travelMinutes: number;
  pickupMinutes: number;
};

const nonNegative = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;

export function deliveryTermsFrom(
  settings: Record<string, unknown> | null | undefined,
): DeliveryTerms {
  return {
    feeTiyin: nonNegative(settings?.delivery_fee_tiyin),
    freeOverTiyin: nonNegative(settings?.free_delivery_over_tiyin),
    minimumTiyin: nonNegative(settings?.min_order_tiyin),
    /*
     * The defaults are the ones `etaMinutes()` falls back to, so an unset venue
     * shows what a guest is actually being promised rather than a zero the
     * server does not use.
     */
    kitchenMinutes: minutesOr(settings?.kitchen_queue_minutes, 10),
    travelMinutes: minutesOr(settings?.delivery_travel_minutes, 25),
    pickupMinutes: minutesOr(settings?.pickup_wait_minutes, 5),
  };
}

/** Zero is a real answer here — a pass that never runs behind — so `??`, not `||`. */
const minutesOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback;

export async function branchesScreen(): Promise<BranchesScreen> {
  const [report, labour, venueRows] = await Promise.all([
    apiGet<{ data?: { branches?: ApiVenue[] } }>('/analytics/branches?period=month'),
    /*
     * `period=week` for the curve, where the table above it is a month.
     *
     * Deliberate, and the two windows answer different questions. The table
     * compares venues against a monthly target; the chart is read to move a
     * shift's start time, and a month of hours averages away exactly the
     * weekday-to-weekend difference that makes a Tuesday afternoon look
     * overstaffed.
     */
    apiGet<ApiLabour>('/analytics/labour-by-hour?period=week'),
    /*
     * The venue documents, for the delivery terms.
     *
     * A second read rather than a wider report: `/analytics/branches` answers
     * about takings, and putting a commercial setting into a takings report
     * would be the wrong home for it the first time somebody caches one.
     */
    apiGet<{ data?: ApiBranchRow[] }>('/branches'),
  ]);

  const venues = report?.data?.branches;
  const curve = labourFrom(labour?.data);
  const terms = new Map(
    (venueRows?.data ?? []).map((venue) => [String(venue.id), deliveryTermsFrom(venue.settings)]),
  );

  if (!venues) return { rows: BRANCH_PERFORMANCE.map(fromFixture), labour: curve, live: false };

  const rows = venues.map((venue): BranchRow => {
    const city = (venue.city ?? '').trim();
    /* Nothing sold here has a recipe cost, so there is no margin to report. */
    const costed = venue.cogs_coverage_percent > 0;

    return {
      id: String(venue.branch_id),
      name: venue.name,
      cityKey: CITY_KEYS[city.toLowerCase()] ?? null,
      cityLabel: city === '' ? null : city,
      revenue: venue.revenue_tiyin,
      orders: venue.orders_count,
      // Read rather than divided: the report already publishes the average per
      // BILL, and computing a second one here is how a row ends up with an
      // average that disagrees with the two figures beside it.
      averageOrder: venue.average_cheque_tiyin,
      margin: costed ? venue.margin_percent : null,
      foodCost: costed ? venue.food_cost_percent : null,
      labour: venue.labour_percent === 0 ? null : venue.labour_percent,
      staff: venue.staff_count,
      openAlerts: venue.open_alerts,
      deltaPercent: venue.delta_percent,
      targetTiyin: venue.target_monthly_tiyin,
      // Absent when `/branches` did not answer — the row still draws, and the
      // delivery card reads zeroes rather than inventing a fee.
      delivery: terms.get(String(venue.branch_id)) ?? deliveryTermsFrom(null),
    };
  });

  // The report already sorts biggest first; sorting again is a line rather than
  // a query, and the share rail below reads backwards if the leader is not the
  // first row.
  return { rows: [...rows].sort((a, b) => b.revenue - a.revenue), labour: curve, live: true };
}

/**
 * The labour curve, or nothing to draw.
 *
 * `has_labour` is the load-bearing check. `UnavailableRoster` answers an empty
 * map and so does a venue where nobody clocked in — the same shape for two
 * different facts — and a chart of 0% bars over real takings reads as a
 * restaurant that traded with no staff. Both are `null` here and the panel is
 * hidden, which is the same answer the screen gave before there was an endpoint
 * at all; the difference is that it is now a fact about this restaurant rather
 * than about the platform.
 *
 * Hours with no wages in them are dropped as well. A venue that opens at eleven
 * should draw a chart that starts at eleven; eleven empty bars at the front is
 * how a reader concludes the morning is dead rather than shut.
 */
export function labourFrom(data: ApiLabour['data'] | undefined): LabourCurve | null {
  if (data === undefined || !data.has_labour) return null;

  const hours = data.hours
    .filter((hour) => hour.labour_tiyin > 0)
    .map((hour): LabourHour => ({
      hour: hour.hour,
      labourTiyin: hour.labour_tiyin,
      revenueTiyin: hour.revenue_tiyin,
      percent: hour.labour_percent,
    }));

  if (hours.length === 0) return null;

  return {
    hours,
    sharePercent: data.labour_percent,
    // The design's threshold, and the same one its bars are coloured at.
    overstaffed: hours.filter((hour) => hour.percent !== null && hour.percent > 35).length,
  };
}

/** The demo console's five venues, in the shape the screen now reads. */
function fromFixture(branch: BranchPerformance): BranchRow {
  return {
    id: branch.id,
    name: branch.name,
    cityKey: branch.city,
    cityLabel: null,
    // The fixture's revenue is one day's; the target is a month's, and the
    // screen has always multiplied by thirty to compare them. Live, both are
    // the same window, so the multiplication belongs here rather than in the
    // page — see `attainmentPercent`.
    revenue: branch.revenue * 30,
    orders: branch.orders,
    averageOrder: branch.averageOrder,
    margin: branch.margin,
    labour: branch.labour,
    foodCost: branch.foodCost,
    staff: branch.staff,
    openAlerts: branch.openAlerts,
    deltaPercent: branch.deltaPercent,
    targetTiyin: branch.targetTiyin,
    /* The demo console has nothing to write to, so the delivery card reads
       zeroes there rather than a fee a fixture invented. */
    delivery: deliveryTermsFrom(null),
  };
}

/**
 * How far through the month's target this venue is.
 *
 * `0` when no target has been set, which is what a new branch looks like:
 * dividing by zero would draw a rail of `Infinity%` on the row of the venue
 * that most obviously still needs configuring.
 */
export function attainmentPercent(branch: BranchRow): number {
  return branch.targetTiyin === 0 ? 0 : Math.round((branch.revenue / branch.targetTiyin) * 100);
}
