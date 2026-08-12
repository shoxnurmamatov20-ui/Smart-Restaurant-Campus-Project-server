/**
 * The shape of the overview screen, and the placeholder that fills it today.
 *
 * The types are the contract; the constant below is scaffolding. When the API
 * lands, `getOverview()` becomes a fetch and nothing in the page changes —
 * which is the point of separating them. Every figure here is the design's
 * sample data, so the screen can be compared against the prototype directly.
 *
 * Figures only. Labels, captions and status words are copy and live in
 * src/i18n, keyed off the ids below — an API that returned "Tushum" would be an
 * API that can only ever answer in Uzbek.
 *
 * Money is in **tiyin**, as it is everywhere else on the platform: the API
 * speaks integer tiyin and converting on the way in would put a float in the
 * one place a rounding error compounds. Formatting happens at the edge, in
 * the component, through `formatTiyinAmount`.
 */

export type KpiKey = 'revenue' | 'orders' | 'average_cheque' | 'gross_profit' | 'expenses';

export type Kpi = {
  key: KpiKey;
  /** Integer tiyin when `unit` is money, a plain count otherwise. */
  value: number;
  unit: 'money' | 'count';
  /**
   * The delta beside the figure. `good` is the meaning, not the sign: falling
   * expenses are not a win, so the design leaves them in muted ink.
   */
  delta: { text: string; good: boolean } | null;
  /**
   * Attainment against the target, 0–1.
   *
   * The design is explicit that the progress rail must carry meaning rather
   * than decorate the card, so this is nullable: a KPI with no target renders
   * no rail instead of a rail at an invented width.
   */
  attainment: number | null;
  /**
   * Which series colour the rail uses. The design alternates brand, accent and
   * warning across the row so five rails do not read as one repeated bar.
   */
  railColour: string;
};

/** One hour of trading: what came in today, and on this weekday on average. */
export type HourPoint = { hour: string; today: number; average: number };

export type TopProduct = {
  id: string;
  /** A dish name is a proper noun; it is not translated. */
  name: string;
  units: number;
  revenue: number;
  /** Share of the best-selling line, 0–1 — the width of the little bar. */
  share: number;
};

export type BranchRow = { id: number; name: string; revenue: number; deltaPercent: number };

export type OrderStatus = 'new' | 'accepted' | 'cooking' | 'ready' | 'to_pay' | 'paid';

export type RecentOrder = { id: string; where: string; status: OrderStatus; total: number };

export type AttentionKey = 'beef' | 'table';

export type Attention = {
  key: AttentionKey;
  /** `warn` is tinted and carries a warning mark, `note` is a plain card. */
  level: 'warn' | 'note';
  href: string;
};

export type Overview = {
  greetingName: string;
  kpis: readonly Kpi[];
  hours: readonly HourPoint[];
  attention: readonly Attention[];
  topProducts: readonly TopProduct[];
  branches: readonly BranchRow[];
  recentOrders: readonly RecentOrder[];
};

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

/**
 * The trading day, hour by hour.
 *
 * These are the prototype's own curve: its chart is a hardcoded polyline, and
 * these figures reproduce it to the pixel once scaled. Stored as revenue rather
 * than as coordinates because the API will send revenue, and a component that
 * takes coordinates cannot be handed real data without being rewritten.
 */
const HOURS: readonly HourPoint[] = [
  { hour: '09', today: som(170_000), average: som(238_000) },
  { hour: '10', today: som(272_000), average: som(374_000) },
  { hour: '11', today: som(578_000), average: som(714_000) },
  { hour: '12', today: som(1_394_000), average: som(1_632_000) },
  { hour: '13', today: som(2_040_000), average: som(2_278_000) },
  { hour: '14', today: som(1_802_000), average: som(2_006_000) },
  { hour: '15', today: som(1_394_000), average: som(1_224_000) },
  { hour: '16', today: som(1_258_000), average: som(1_020_000) },
  { hour: '17', today: som(1_768_000), average: som(1_496_000) },
  { hour: '18', today: som(2_516_000), average: som(2_142_000) },
  { hour: '19', today: som(2_822_000), average: som(2_516_000) },
  { hour: '20', today: som(2_380_000), average: som(2_040_000) },
];

const PLACEHOLDER: Overview = {
  greetingName: 'Rustam',

  kpis: [
    {
      key: 'revenue',
      value: som(18_420_000),
      unit: 'money',
      delta: { text: '+12.4%', good: true },
      attainment: 0.74,
      railColour: 'var(--brand-500)',
    },
    {
      key: 'orders',
      value: 192,
      unit: 'count',
      delta: { text: '+8', good: true },
      attainment: 0.8,
      railColour: 'var(--accent-500)',
    },
    {
      key: 'average_cheque',
      value: som(95_900),
      unit: 'money',
      delta: { text: '+3.1%', good: true },
      attainment: 0.96,
      railColour: 'var(--brand-500)',
    },
    {
      key: 'gross_profit',
      value: som(11_260_000),
      unit: 'money',
      delta: null,
      attainment: 0.61,
      railColour: 'var(--accent-500)',
    },
    {
      key: 'expenses',
      value: som(4_180_000),
      unit: 'money',
      delta: { text: '−2.0%', good: false },
      attainment: 0.84,
      railColour: 'var(--warning-500)',
    },
  ],

  hours: HOURS,

  attention: [
    { key: 'beef', level: 'warn', href: '/inventory' },
    { key: 'table', level: 'note', href: '/tables' },
  ],

  topProducts: [
    { id: 'osh', name: 'Osh, beef', units: 64, revenue: som(2_688_000), share: 1 },
    { id: 'lavash', name: 'Lavash, classic', units: 51, revenue: som(1_632_000), share: 0.8 },
    { id: 'burger', name: 'Cheeseburger', units: 47, revenue: som(1_833_000), share: 0.73 },
    { id: 'somsa', name: 'Somsa, beef', units: 38, revenue: som(456_000), share: 0.59 },
    { id: 'margherita', name: 'Margherita', units: 29, revenue: som(1_972_000), share: 0.45 },
  ],

  branches: [
    { id: 1, name: 'Chilonzor', revenue: som(6_240_000), deltaPercent: 12.4 },
    { id: 2, name: 'Yunusobod', revenue: som(4_810_000), deltaPercent: 6.1 },
    { id: 3, name: "Mirzo Ulug'bek", revenue: som(3_470_000), deltaPercent: -2.8 },
    { id: 4, name: 'Sergeli', revenue: som(2_390_000), deltaPercent: 4.4 },
    { id: 5, name: 'Termiz Markaz', revenue: som(1_510_000), deltaPercent: -7.2 },
  ],

  recentOrders: [
    { id: 'A-1291', where: 'Stol 12', status: 'cooking', total: som(402_000) },
    { id: 'A-1290', where: 'Stol 8', status: 'ready', total: som(612_000) },
    { id: 'A-1289', where: 'VIP 2', status: 'cooking', total: som(1_240_000) },
    { id: 'A-1288', where: 'Stol 7', status: 'to_pay', total: som(318_000) },
    { id: 'A-1287', where: 'Yandex Eats', status: 'ready', total: som(128_000) },
  ],
};

/** The tint each status carries. The words themselves are in src/i18n. */
export const ORDER_STATUS_TONE: Record<OrderStatus, string> = {
  new: 'bg-bg-muted text-fg-muted',
  accepted: 'bg-brand-50 text-brand-700',
  cooking: 'bg-warning-50 text-warning-700',
  ready: 'bg-success-50 text-success-700',
  to_pay: 'bg-warning-50 text-warning-700',
  paid: 'bg-bg-muted text-fg-muted',
};

/**
 * Where the backend plugs in.
 *
 * Async today only so the call site is already written the way it will stay:
 * when this becomes `api.get('/analytics/overview')`, the page keeps its
 * `await` and nothing else moves. Takes the branch so the seam carries the one
 * argument every real query will need — an owner reading all five venues
 * passes null, which is exactly what the branch scope means server-side.
 */
export async function getOverview(branchSlug: string | null = null): Promise<Overview> {
  // TODO(api): GET /api/v1/analytics/overview?period=today, sending branchSlug
  // as the X-Branch header. Until then the page renders the design's sample
  // figures so the layout can be reviewed against the prototype.
  void branchSlug;

  return PLACEHOLDER;
}
