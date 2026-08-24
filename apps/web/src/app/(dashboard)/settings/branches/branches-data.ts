/**
 * Every venue side by side, as the design's Branches screen compares them.
 *
 * Money is integer tiyin. Labour and food cost are percentages of that
 * branch's own revenue, which is the only way five venues of different sizes
 * can be read on one row.
 *
 * What is here is the demo console's five venues — the render a reader gets
 * when there is no session behind the screen. The live one reads the
 * restaurant's own from the sibling `branches-server.ts`, which now makes a
 * single call: `GET /api/v1/analytics/branches?period=`, and that one report
 * answers all nine columns.
 *
 * It did not always. Six of the nine — margin, labour, food cost, headcount,
 * open alerts and the change against last period — had no per-branch source
 * anywhere and were drawn as dashes, because the two endpoints this file used
 * to name between them knew only the register and the takings. What closed the
 * gap was `analytics.daily_facts`: one row per venue per trading day carrying
 * revenue, cost of goods, labour and discounts, which turns five of those six
 * into a grouped scan and the sixth — `openAlerts`, which had no definition on
 * the platform at all — into thresholds over the same row. The service
 * (`Modules/Analytics/app/Services/BranchPerformance.php`) states the
 * definition it settled on.
 *
 * `LABOUR_BY_HOUR` below is still a fixture, and it is not the same gap: labour
 * cost is answered for a window, never hour by hour, so there is no curve to
 * read.
 */

export type BranchPerformance = {
  id: string;
  /** A venue's name is a proper noun; it is not translated. */
  name: string;
  city: 'tashkent' | 'termiz';
  /** Today's takings, in tiyin. */
  revenue: number;
  orders: number;
  averageOrder: number;
  /** Gross margin, as a percentage. */
  margin: number;
  /** Payroll as a share of revenue. Above 30 is a rota problem. */
  labour: number;
  /** Ingredients as a share of revenue. */
  foodCost: number;
  staff: number;
  openAlerts: number;
  /** Against the same period last time. */
  deltaPercent: number;
  /** This month's target, in tiyin. */
  targetTiyin: number;
};

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

export const BRANCH_PERFORMANCE: readonly BranchPerformance[] = [
  {
    id: 'chilonzor',
    name: 'Chilonzor',
    city: 'tashkent',
    revenue: som(6_240_000),
    orders: 68,
    averageOrder: som(91_800),
    margin: 62.4,
    labour: 22.4,
    foodCost: 31.2,
    staff: 19,
    openAlerts: 4,
    deltaPercent: 12.4,
    targetTiyin: som(180_000_000),
  },
  {
    id: 'yunusobod',
    name: 'Yunusobod',
    city: 'tashkent',
    revenue: som(4_810_000),
    orders: 51,
    averageOrder: som(94_300),
    margin: 60.1,
    labour: 24.1,
    foodCost: 32.8,
    staff: 16,
    openAlerts: 1,
    deltaPercent: 6.2,
    targetTiyin: som(140_000_000),
  },
  {
    id: 'mirzo',
    name: "Mirzo Ulug'bek",
    city: 'tashkent',
    revenue: som(3_470_000),
    orders: 39,
    averageOrder: som(89_000),
    margin: 57.8,
    labour: 27.6,
    foodCost: 34.1,
    staff: 14,
    openAlerts: 2,
    deltaPercent: -3.1,
    targetTiyin: som(120_000_000),
  },
  {
    id: 'sergeli',
    name: 'Sergeli',
    city: 'tashkent',
    revenue: som(2_390_000),
    orders: 22,
    averageOrder: som(108_600),
    margin: 59.3,
    labour: 29.8,
    foodCost: 33.4,
    staff: 11,
    openAlerts: 0,
    deltaPercent: 1.8,
    targetTiyin: som(70_000_000),
  },
  {
    id: 'termiz',
    name: 'Termiz Markaz',
    city: 'termiz',
    revenue: som(1_510_000),
    orders: 12,
    averageOrder: som(125_800),
    margin: 54.2,
    labour: 33.2,
    foodCost: 36.7,
    staff: 9,
    openAlerts: 3,
    deltaPercent: -8.4,
    targetTiyin: som(60_000_000),
  },
];

/**
 * Payroll against revenue, hour by hour, 09:00 to 22:00.
 *
 * Above 35% means more people than the hour needs — which is what the colour
 * says. Below 25% is the target, and the caption under the chart states it, so
 * a manager is not left to infer the benchmark from the bars.
 */
export const LABOUR_BY_HOUR: readonly { hour: number; percent: number }[] = [
  { hour: 9, percent: 48 },
  { hour: 10, percent: 41 },
  { hour: 11, percent: 33 },
  { hour: 12, percent: 22 },
  { hour: 13, percent: 18 },
  { hour: 14, percent: 21 },
  { hour: 15, percent: 38 },
  { hour: 16, percent: 44 },
  { hour: 17, percent: 31 },
  { hour: 18, percent: 21 },
  { hour: 19, percent: 17 },
  { hour: 20, percent: 19 },
  { hour: 21, percent: 28 },
  { hour: 22, percent: 39 },
];

export const LABOUR_SUMMARY = { total: '26.1%', overstaffedHours: 5 } as const;

/** A month's takings against a month's target. */
export const attainment = (branch: BranchPerformance): number =>
  Math.round(((branch.revenue * 30) / branch.targetTiyin) * 100);

/** The design's thresholds for a labour percentage. */
export function labourTone(percent: number): string {
  if (percent <= 25) return 'text-fg-muted';
  if (percent <= 30) return 'text-warning-700';

  return 'text-danger-700';
}

/** And for food cost, which runs a little higher before it worries anyone. */
export function foodCostTone(percent: number): string {
  if (percent <= 32) return 'text-fg-muted';
  if (percent <= 35) return 'text-warning-700';

  return 'text-danger-700';
}
