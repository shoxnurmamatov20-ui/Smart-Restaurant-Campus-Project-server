import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { EmptyState, KpiCard as UiKpiCard, type Tone } from '@restaurant/ui';
import { formatNumber, formatTiyinAmount } from '@restaurant/utils';

import {
  ORDER_STATUS_TONE,
  type Attention,
  type BranchRow,
  type HourPoint,
  type Kpi,
  type Period,
  type RecentOrder,
  type TopProduct,
} from './overview-data';
import { todayLabel } from '@/lib/today-label';

import { ledeText } from './lede';
import { marginOf } from './margin';
import { getOverviewLive } from './overview-server';
import { GLYPH } from './kpi-icons';
import { PeriodToggle } from './period-toggle';

/** A raised surface: hairline first, shadow only for things that float. */
const CARD = 'bg-surface rounded-lg border';
const PANEL = `${CARD} px-6 py-[22px]`;
const H3 = 'font-display text-md font-semibold tracking-snug';

/**
 * Copy and glyph for one KPI, keyed off the figure's id.
 *
 * The picture belongs in the same row as the words: the design gives each of
 * the five its own badge, and a table that decides the label here and the icon
 * somewhere else is a table that drifts the first time a figure is renamed.
 */
const KPI_COPY: Record<
  Kpi['key'],
  { label: string; unit: string; target: string; glyph: keyof typeof GLYPH }
> = {
  revenue: { label: 'kRevenue', unit: 'som', target: 'targetRevenue', glyph: 'revenue' },
  orders: { label: 'kOrders', unit: 'closed', target: 'targetOrders', glyph: 'orders' },
  average_cheque: { label: 'kAov', unit: 'som', target: 'targetAov', glyph: 'average' },
  gross_profit: { label: 'kGross', unit: 'marginOf', target: 'targetGross', glyph: 'profit' },
  expenses: { label: 'kExpenses', unit: 'som', target: 'targetExpenses', glyph: 'expenses' },
};

/**
 * The rail's tone, from the colour the data layer already picked.
 *
 * `overview-data.ts` hands back a CSS custom property because the design names
 * one per figure; `KpiCard` takes a tone. Mapping here rather than changing the
 * data keeps the alternation the design specifies — five rails in one colour
 * read as a single repeated bar — without two files having opinions about it.
 */
const RAIL_TONE: Record<string, Tone> = {
  'var(--brand-500)': 'brand',
  'var(--accent-500)': 'accent',
  'var(--success-500)': 'success',
  'var(--warning-500)': 'warning',
  'var(--danger-500)': 'danger',
};

/**
 * Three lines per card: what happened, what to do, and where to go.
 *
 * `Record` over the full key union rather than a lookup with a fallback, so a
 * rule the server grows cannot reach this screen as an untitled card — adding
 * the key to `AttentionKey` fails the build here until somebody writes the
 * sentence. The first two are the design's own sample cards and carry figures;
 * the other five are the server's rules and deliberately carry none, because
 * `GET /dashboard` sends a key and a level and no numbers at all.
 */
const ATTENTION_COPY: Record<Attention['key'], { title: string; body: string; cta: string }> = {
  beef: { title: 'attnBeef', body: 'attnBeefBody', cta: 'attnBeefCta' },
  table: { title: 'attnTable', body: 'attnTableBody', cta: 'attnTableCta' },
  food_cost: { title: 'attnFoodCost', body: 'attnFoodCostBody', cta: 'attnFoodCostCta' },
  labour_cost: { title: 'attnLabour', body: 'attnLabourBody', cta: 'attnLabourCta' },
  stock_out: { title: 'attnStockOut', body: 'attnStockOutBody', cta: 'attnStockOutCta' },
  stock_low: { title: 'attnStockLow', body: 'attnStockLowBody', cta: 'attnStockLowCta' },
  void_rate: { title: 'attnVoids', body: 'attnVoidsBody', cta: 'attnVoidsCta' },
};

type Dict = Awaited<ReturnType<typeof getTranslations<'console.dashboard'>>>;

/**
 * The owner's overview — the screen opened first in the morning.
 *
 * Built to the design's own dashboard, panel for panel: an eyebrow date over a
 * 30px greeting with the period segment opposite, a KPI row that reflows on
 * `minmax(min(212px,100%),1fr)`, a 1.65/1 split carrying the trading day
 * against what needs a decision, and a three-up row of the day's detail
 * underneath.
 *
 * Tailwind against the design's tokens throughout — `text-3xl` is its 30px,
 * `rounded-lg` its 14px, `text-fg-subtle` its muted ink. Only data-attribute
 * states and scrollbar chrome need a stylesheet; those live in ../app-shell.css.
 *
 * A server component. Figures come from `getOverviewLive()` —
 * `GET /api/v1/dashboard?role=`, falling back to the design's own sample data
 * when there is no session or the API is restarting; words come from the
 * catalogue, in whichever of the three languages the reader has chosen. One
 * panel is still sample data on purpose and overview-server.ts says which.
 */
export async function OwnerDashboard({ period = 'today' }: { period?: Period }) {
  const [data, t, locale] = await Promise.all([
    getOverviewLive(period),
    getTranslations('console.dashboard'),
    getLocale(),
  ]);

  return (
    <>
      <div data-pagehead className="mb-6 flex items-end justify-between gap-6">
        <div>
          <div className="text-fg-subtle tracking-caps mb-2 text-xs font-semibold uppercase">
            {todayLabel(locale, new Date())}
          </div>
          <h2 className="font-display text-3xl leading-[1.1] font-semibold tracking-tight">
            {t('greeting', { name: data.greetingName })}
          </h2>
          <p className="text-fg-muted text-md mt-2 leading-normal">{ledeText(data.lede, t)}</p>
        </div>

        <PeriodToggle
          current={period}
          ariaLabel={t('kpiLabel')}
          labels={{ today: t('periodToday'), week: t('periodWeek'), month: t('periodMonth') }}
        />
      </div>

      <section
        aria-label={t('kpiLabel')}
        className="mb-5 grid [grid-template-columns:repeat(auto-fit,minmax(min(212px,100%),1fr))] gap-3.5"
      >
        {data.kpis.map((kpi) => (
          <KpiCard
            key={kpi.key}
            kpi={kpi}
            t={t}
            caption={kpi.key === 'gross_profit' ? marginCaption(data.kpis, t) : undefined}
          />
        ))}
      </section>

      <div
        data-split
        className="mb-5 grid [grid-template-columns:minmax(0,1.65fr)_minmax(0,1fr)] gap-5"
      >
        <SalesThroughDay hours={data.hours} t={t} />
        <AttentionPanel items={data.attention} t={t} />
      </div>

      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-5">
        <BestSellers products={data.topProducts} t={t} />
        <BranchPerformance branches={data.branches} t={t} />
        <RecentOrders orders={data.recentOrders} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

/**
 * One figure, its delta, and the rail underneath.
 *
 * `packages/ui`'s card rather than a local copy of it. The local one predated
 * the shared component and had drifted from the design in the two places the
 * design is most specific about: a 12px sentence-case label where the file sets
 * 10px uppercase at `.07em`, and no glyph badge at all. It also carried no
 * `data-kpi`, so the entrance stagger and the hover lift in `motion.css` — the
 * only motion on this screen — never ran here.
 *
 * The rail still refuses to draw without a target. A bar at an invented width
 * beside a real number is how a reader learns to distrust the number.
 */
/** "61.1% marja" — from the figures, or nothing when there is nothing to divide. */
function marginCaption(kpis: readonly Kpi[], t: Dict): string | null {
  const margin = marginOf(kpis);

  return margin === null ? null : t('marginOf', { percent: margin });
}

function KpiCard({ kpi, t, caption }: { kpi: Kpi; t: Dict; caption?: string | null }) {
  const copy = KPI_COPY[kpi.key];
  const value =
    kpi.value === null
      ? '—'
      : kpi.unit === 'money'
        ? formatTiyinAmount(kpi.value)
        : formatNumber(kpi.value);

  return (
    <UiKpiCard
      label={t(copy.label)}
      value={value}
      unit={
        caption !== undefined
          ? (caption ?? undefined)
          : kpi.value === null
            ? undefined
            : t(copy.unit)
      }
      delta={kpi.delta?.text}
      deltaTone={kpi.delta?.good ? 'success' : 'neutral'}
      {...GLYPH[copy.glyph]}
      attainment={kpi.attainment === null ? null : Math.min(100, Math.round(kpi.attainment * 100))}
      railTone={RAIL_TONE[kpi.railColour] ?? 'brand'}
      target={kpi.attainment === null ? undefined : t(copy.target)}
    />
  );
}

/* The chart's own geometry, in the viewBox the design draws it in. */
const CHART = { width: 700, height: 196, bottom: 192, peakY: 26 } as const;

/**
 * The trading day: today's takings against the same weekday's average.
 *
 * An inline SVG rather than a charting library. Twelve points and two lines do
 * not need one, it would ship a hundred kilobytes to draw them, and — the real
 * reason — a library owns its own colours and easing, which is exactly what a
 * design system exists to prevent.
 *
 * `preserveAspectRatio="none"` lets the 700-unit viewBox stretch to whatever
 * width the panel has while the vertical scale stays honest.
 */
function SalesThroughDay({ hours, t }: { hours: readonly HourPoint[]; t: Dict }) {
  /*
   * The comparison line exists only where every point has one. A rolling
   * weekday average is not on the endpoint, so a live chart draws one series —
   * and drops the legend and the caption that promise two, rather than
   * plotting today against the demo restaurant's Tuesday.
   */
  const comparable = hours.every((point) => point.average !== null);
  const peak = Math.max(
    ...hours.flatMap((point) =>
      point.average === null ? [point.today] : [point.today, point.average],
    ),
  );
  const span = CHART.bottom - CHART.peakY;

  // A day with nothing sold yet has a peak of zero, and zero divided into
  // anything is NaN — which the browser reports as a broken path on every
  // render of a brand-new restaurant's home screen. A flat line at the
  // baseline is what a quiet morning looks like.
  const x = (index: number) => (hours.length < 2 ? 0 : (index / (hours.length - 1)) * CHART.width);
  const y = (value: number) => (peak > 0 ? CHART.bottom - (value / peak) * span : CHART.bottom);

  const plot = (pick: (point: HourPoint) => number) =>
    hours.map((point, index) => `${x(index).toFixed(1)},${y(pick(point)).toFixed(1)}`).join(' ');

  const today = plot((point) => point.today);
  const average = comparable ? plot((point) => point.average ?? 0) : '';
  const busiest = hours.reduce((best, point) => (point.today > best.today ? point : best));

  return (
    <section className={`${CARD} px-6 pt-[22px] pb-[18px]`}>
      <div className="mb-[22px] flex items-start justify-between gap-4">
        <div>
          <h3 className={H3}>{t('chartTitle')}</h3>
          <p className="text-fg-subtle mt-1 text-xs">
            {comparable ? t('chartSub') : t('chartSubLive')}
          </p>
        </div>
        <div className="flex flex-none gap-4">
          <Legend colour="bg-brand-500">{t('legendToday')}</Legend>
          {comparable ? <Legend colour="bg-border-strong">{t('legendAverage')}</Legend> : null}
        </div>
      </div>

      <div className="relative h-[196px]">
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
          role="img"
          aria-label={t('chartAlt')}
        >
          {[4, 52, 100, 148].map((gridline) => (
            <line
              key={gridline}
              x1="0"
              y1={gridline}
              x2={CHART.width}
              y2={gridline}
              stroke="var(--divider)"
              strokeWidth="1"
            />
          ))}
          <line
            x1="0"
            y1={CHART.bottom}
            x2={CHART.width}
            y2={CHART.bottom}
            stroke="var(--border)"
            strokeWidth="1"
          />

          {/* The comparison first, so today's line sits over it. */}
          {comparable ? (
            <polyline
              points={average}
              fill="none"
              stroke="var(--border-strong)"
              strokeWidth="1.75"
              strokeDasharray="4 4"
              strokeLinecap="round"
            />
          ) : null}

          <path
            d={`M${today} L${CHART.width},${CHART.bottom} L0,${CHART.bottom} Z`}
            fill="var(--brand-500)"
            opacity="0.06"
          />
          <polyline
            points={today}
            fill="none"
            stroke="var(--brand-500)"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* The busiest hour, marked. */}
          <circle
            cx={x(hours.indexOf(busiest))}
            cy={y(busiest.today)}
            r="4"
            fill="var(--surface)"
            stroke="var(--brand-500)"
            strokeWidth="2.25"
          />
        </svg>
      </div>

      <div data-num className="text-fg-subtle text-2xs mt-2.5 flex justify-between">
        {hours.map((point) => (
          <span key={point.hour}>{point.hour}</span>
        ))}
      </div>
    </section>
  );
}

function Legend({ colour, children }: { colour: string; children: React.ReactNode }) {
  return (
    <span className="text-fg-muted flex items-center gap-1.5 text-xs">
      <span aria-hidden className={`h-0.5 w-3.5 rounded-[2px] ${colour}`} />
      {children}
    </span>
  );
}

/**
 * What needs a decision today.
 *
 * Two levels, as the design draws them: the first is tinted and carries a
 * warning mark, the second is a plain bordered card. Severity is never colour
 * alone — the icon and the wording say it too.
 *
 * The subtitle counts rather than describes. It read "two open items, oldest 26
 * minutes" while the panel was two fixtures; the live list is between zero and
 * four cards and carries no ages, so the only sentence that stays true under
 * both is the number of cards under it.
 */
function AttentionPanel({ items, t }: { items: readonly Attention[]; t: Dict }) {
  return (
    <section className={PANEL}>
      <h3 className={`${H3} mb-1`}>{t('attentionTitle')}</h3>
      <p className="text-fg-subtle mb-[18px] text-xs">
        {items.length === 0 ? t('attentionEmpty') : t('attentionSub', { n: items.length })}
      </p>

      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const warn = item.level === 'warn';
          const copy = ATTENTION_COPY[item.key];

          return (
            <div
              key={item.key}
              className={`flex gap-3 rounded-md border p-3.5 ${warn ? 'bg-warning-50' : ''}`}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke={warn ? 'var(--warning-600)' : 'var(--fg-muted)'}
                strokeWidth="2"
                strokeLinecap="round"
                className="mt-px flex-none"
                aria-hidden
              >
                {warn ? (
                  <>
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                    <path d="M10.3 3.9 2.6 17.2A1.9 1.9 0 0 0 4.3 20h15.4a1.9 1.9 0 0 0 1.7-2.8L13.7 3.9a1.9 1.9 0 0 0-3.4 0z" />
                  </>
                ) : (
                  <>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7.5v5l3 2" />
                  </>
                )}
              </svg>

              <div className="min-w-0">
                <div className={`text-sm font-semibold ${warn ? 'text-warning-700' : ''}`}>
                  {t(copy.title)}
                </div>
                <p
                  className={`mt-1 text-xs leading-normal ${
                    warn ? 'text-warning-700 opacity-85' : 'text-fg-muted'
                  }`}
                >
                  {t(copy.body)}
                </p>
                <Link
                  href={item.href}
                  className={`mt-[9px] inline-block text-xs font-semibold underline underline-offset-[3px] ${
                    warn ? 'text-warning-700' : 'text-fg-brand'
                  }`}
                >
                  {t(copy.cta)}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** The header the three lower panels share: a title, and one thing opposite. */
function PanelHead({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-[18px] flex items-baseline justify-between gap-3">
      <h3 className={H3}>{title}</h3>
      {children}
    </div>
  );
}

/** Their row geometry too: inset 8px, pulled back out so the hover fills. */
const ROW = 'flex items-center gap-3.5 rounded-sm px-2 py-2.5 -mx-2';

function BestSellers({ products, t }: { products: readonly TopProduct[]; t: Dict }) {
  return (
    <section className={PANEL}>
      <PanelHead title={t('bestSellers')}>
        <span className="text-fg-subtle text-xs whitespace-nowrap">{t('byUnits')}</span>
      </PanelHead>

      <div className="flex flex-col gap-0.5">
        {products.map((product, index) => (
          <div key={product.id} data-row className={ROW}>
            <span data-num className="text-fg-subtle w-[18px] text-xs font-medium">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{product.name}</span>
            <span className="bg-bg-muted h-1 w-24 flex-none overflow-hidden rounded-[2px]">
              <span
                className="bg-brand-500 block h-full rounded-[2px]"
                style={{ width: `${Math.round(product.share * 100)}%` }}
              />
            </span>
            <span data-num className="w-[38px] text-right text-sm font-semibold">
              {product.units}
            </span>
            {/* Millions to one decimal — the design's own shorthand, so five
                revenue figures stay a column rather than a wall of digits. */}
            <span data-num className="text-fg-subtle w-[86px] text-right text-xs">
              {(product.revenue / 100_000_000).toFixed(1)}M
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function BranchPerformance({ branches, t }: { branches: readonly BranchRow[]; t: Dict }) {
  return (
    <section className={PANEL}>
      <PanelHead title={t('branchPerformance')}>
        <Link
          href="/settings/branches"
          className="text-fg-brand text-xs font-medium whitespace-nowrap"
        >
          {t('compareAll')}
        </Link>
      </PanelHead>

      <div className="flex flex-col gap-0.5">
        {branches.map((branch) => (
          <div key={branch.id} data-row className={ROW}>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{branch.name}</span>
            <span data-num className="w-24 text-right text-sm font-semibold">
              {formatTiyinAmount(branch.revenue)}
            </span>
            <span
              data-num
              className={`w-16 text-right text-xs font-semibold ${
                branch.deltaPercent > 0 ? 'text-success-700' : 'text-danger-700'
              }`}
            >
              {branch.deltaPercent > 0 ? '+' : '−'}
              {Math.abs(branch.deltaPercent).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

async function RecentOrders({ orders }: { orders: readonly RecentOrder[] }) {
  const [t, status] = await Promise.all([
    getTranslations('console.dashboard'),
    getTranslations('console.orderStatus'),
  ]);

  return (
    <section className={PANEL}>
      <PanelHead title={t('recentOrders')}>
        <Link href="/orders" className="text-fg-brand text-xs font-medium whitespace-nowrap">
          {t('allOrders')}
        </Link>
      </PanelHead>

      {orders.length === 0 ? (
        <EmptyState className="py-4">{t('recentOrdersEmpty')}</EmptyState>
      ) : (
        <div className="flex flex-col gap-0.5">
          {orders.map((order) => (
            <div key={order.id} data-row className={`${ROW} gap-3`}>
              <span className="text-fg-subtle w-[52px] font-mono text-xs">{order.id}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{order.where}</span>
              <span
                className={`rounded-pill text-2xs px-2 py-[3px] font-semibold whitespace-nowrap ${ORDER_STATUS_TONE[order.status]}`}
              >
                {status(order.status)}
              </span>
              <span data-num className="w-[84px] text-right text-sm font-semibold">
                {formatTiyinAmount(order.total)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
