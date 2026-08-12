import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { formatNumber, formatTiyinAmount } from '@restaurant/utils';

import {
  BILLING_LABEL,
  HEALTH_ROWS,
  LOG_DOT,
  MRR_TREND,
  PLANS,
  PLATFORM,
  PLAN_BY_ID,
  SYSTEM_LOG,
  TENANTS,
} from '../platform-data';

export async function generateMetadata() {
  const nav = await getTranslations('platform.nav');
  return { title: nav('overview') };
}

/**
 * The platform, at a glance.
 *
 * Built to the design's super-admin overview: four figures against their
 * targets, the revenue trend beside the plan mix, then every restaurant with
 * the system's own health and today's events alongside.
 *
 * This console wears a neutral brand rather than the product's blue — see
 * globals.css. That is deliberate and it matters here more than anywhere: this
 * is the window where somebody suspends a restaurant, and it should never be
 * mistaken for the window where somebody takes an order.
 *
 * Every KPI carries a target under its bar. A revenue figure with nothing to
 * compare it against is a number; the same figure at 81% of where it should be
 * is a decision.
 *
 * TODO — once the platform API lands:
 *   - Real figures, and the period picker over them
 *   - Churn and expansion, which MRR alone hides
 *   - Alerting off the health panel rather than a page someone remembers to open
 */
const CARD = 'bg-surface rounded-lg border';
const H3 = 'text-md font-semibold tracking-snug';
const COLUMNS =
  '[grid-template-columns:minmax(0,1.5fr)_130px_100px_110px_150px_130px_120px] gap-4 px-5';

/* The chart's geometry, in the viewBox the design draws it in. */
const CHART = { width: 682, height: 160, bottom: 150, floor: 170, span: 330, rise: 130 } as const;

/** Millions of so'm, as the plan-mix legend abbreviates them. */
const short = (tiyin: number): string => `${(tiyin / 100 / 1_000_000).toFixed(1)}M`;

/** Which health row belongs to which catalogue key, in the design's order. */
const HEALTH_KEYS = [
  'uptime',
  'latency',
  'dbLoad',
  'offlineTerminals',
  'syncErrors',
  'errorRate',
] as const;

export default async function PlatformOverviewPage() {
  const t = await getTranslations('platform.overview');
  const col = await getTranslations('platform.columns');
  const health = await getTranslations('platform.health');
  const state = await getTranslations('platform.state');

  const x = (index: number) => index * 62;
  const y = (millions: number) =>
    Math.round(CHART.bottom - ((millions - CHART.floor) / CHART.span) * CHART.rise);

  const path = MRR_TREND.map((point, index) => `${x(index)},${y(point.millions)}`).join(' ');

  /* Enterprise first, so the widest arc starts at twelve o'clock. */
  const mix = [...PLANS].reverse();

  const kpis = [
    {
      label: t('restaurants'),
      value: formatNumber(PLATFORM.restaurants),
      note: (
        <>
          <span className="text-success-700 font-semibold">
            {`+${formatNumber(PLATFORM.addedThisMonth)}`}
          </span>{' '}
          {t('added')}
        </>
      ),
      foot: `${t('target')} ${formatNumber(PLATFORM.restaurantTarget)}`,
      percent: 84,
      colour: 'var(--brand-500)',
    },
    {
      label: t('branches'),
      value: formatNumber(PLATFORM.branches),
      note: `${formatNumber(PLATFORM.users)} ${t('usersSuffix')}`,
      foot: `${formatNumber(PLATFORM.branchTotal)} ${t('ofActive')}`,
      percent: 96,
      colour: 'var(--accent-500)',
    },
    {
      label: t('mrr'),
      value: formatTiyinAmount(PLATFORM.mrrTiyin),
      note: (
        <>
          {t('perMonth')} ·{' '}
          <span className="text-success-700 font-semibold">{PLATFORM.mrrGrowth}</span>
        </>
      ),
      foot: `${t('target')} ${formatTiyinAmount(PLATFORM.mrrTargetTiyin)}`,
      percent: 81,
      colour: 'var(--brand-500)',
    },
    {
      label: t('issues'),
      value: formatNumber(PLATFORM.paymentIssues),
      note: `${formatTiyinAmount(PLATFORM.unpaidTiyin)} ${t('unpaid')}`,
      foot: `${formatNumber(PLATFORM.restaurants)} ${t('ofAll')}`,
      percent: 7,
      colour: 'var(--danger-500)',
      tone: 'text-danger-700',
    },
  ];

  return (
    <>
      <div className="mb-5 grid [grid-template-columns:repeat(auto-fit,minmax(212px,1fr))] gap-3.5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`${CARD} px-5 pt-[18px] pb-4`}>
            <div className="text-fg-subtle mb-2.5 text-xs">{kpi.label}</div>
            <div
              data-num
              className={`font-display text-3xl leading-none font-semibold tracking-tight ${kpi.tone ?? ''}`}
            >
              {kpi.value}
            </div>
            <div data-num className="text-fg-subtle mt-2 text-xs">
              {kpi.note}
            </div>

            <div className="bg-bg-muted mt-3.5 h-[3px] overflow-hidden rounded-[2px]">
              <div
                className="h-full rounded-[2px]"
                style={{ width: `${kpi.percent}%`, background: kpi.colour }}
              />
            </div>

            <div data-num className="text-fg-subtle text-2xs mt-[7px]">
              {kpi.foot}
            </div>
          </div>
        ))}
      </div>

      <div
        data-split
        className="mb-5 grid [grid-template-columns:minmax(0,1.6fr)_minmax(0,1fr)] gap-5"
      >
        <section className={`${CARD} px-6 pt-[22px] pb-[18px]`}>
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h3 className={H3}>{t('mrrTrend')}</h3>
              <p className="text-fg-subtle mt-1 text-xs">{t('mrrTrendSub')}</p>
            </div>
            <span data-num className="text-success-700 text-xs font-semibold whitespace-nowrap">
              {PLATFORM.mrrGrowth} / {t('perMonthShort')}
            </span>
          </div>

          <div className="h-[170px]">
            <svg
              viewBox={`0 0 ${CHART.width} ${CHART.height}`}
              preserveAspectRatio="none"
              className="h-full w-full overflow-visible"
              role="img"
              aria-label={t('mrrTrend')}
            >
              {[20, 63, 106].map((line) => (
                <line
                  key={line}
                  x1="0"
                  y1={line}
                  x2={CHART.width}
                  y2={line}
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

              <polygon
                points={`${path} ${CHART.width},${CHART.bottom} 0,${CHART.bottom}`}
                fill="var(--brand-500)"
                opacity="0.07"
              />
              <polyline
                points={path}
                fill="none"
                stroke="var(--brand-500)"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx={CHART.width}
                cy={y(MRR_TREND[MRR_TREND.length - 1]!.millions)}
                r="4"
                fill="var(--surface)"
                stroke="var(--brand-500)"
                strokeWidth="2.25"
              />
            </svg>
          </div>

          <div data-num className="text-fg-subtle text-2xs mt-2.5 flex justify-between">
            {MRR_TREND.map((point) => (
              <span key={point.month}>{point.month}</span>
            ))}
          </div>
        </section>

        <section className={`${CARD} px-6 py-[22px]`}>
          <h3 className={H3}>{t('planMix')}</h3>
          <p className="text-fg-subtle mt-1 text-xs">
            {PLATFORM.restaurants} {t('planMixSub')}
          </p>

          {/*
            A donut, drawn with one stroked circle per plan.
            `pathLength="100"` lets each arc be expressed as a percentage
            directly, so the dash maths does not depend on the radius — change
            the size and the chart stays correct.
          */}
          <div className="flex justify-center pt-[18px] pb-1.5">
            <div className="relative size-[168px]">
              <svg
                viewBox="0 0 120 120"
                className="size-full -rotate-90"
                role="img"
                aria-label={t('planMix')}
              >
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="var(--bg-muted)"
                  strokeWidth="15"
                />

                {
                  mix.reduce<{ offset: number; arcs: React.ReactNode[] }>(
                    (acc, plan) => {
                      const share = (plan.count / PLATFORM.restaurants) * 100;

                      acc.arcs.push(
                        <circle
                          key={plan.id}
                          cx="60"
                          cy="60"
                          r="52"
                          fill="none"
                          stroke={plan.colour}
                          strokeWidth="15"
                          pathLength="100"
                          strokeDasharray={`${share.toFixed(2)} ${(100 - share).toFixed(2)}`}
                          strokeDashoffset={-acc.offset}
                        />,
                      );

                      return { offset: acc.offset + share, arcs: acc.arcs };
                    },
                    { offset: 0, arcs: [] },
                  ).arcs
                }
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                <span
                  data-num
                  className="font-display text-2xl leading-none font-semibold tracking-tight"
                >
                  {formatNumber(PLATFORM.restaurants)}
                </span>
                <span className="text-fg-subtle text-2xs">{t('planTotal')}</span>
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-col gap-0.5">
            {mix.map((plan) => (
              <div key={plan.id} className="border-divider flex items-center gap-2.5 border-t py-2">
                <span
                  aria-hidden
                  className="rounded-pill size-2 flex-none"
                  style={{ background: plan.colour }}
                />
                <span className="min-w-0 flex-1 text-sm font-medium">{plan.id}</span>
                <span data-num className="text-fg-subtle text-xs tabular-nums">
                  {Math.round((plan.count / PLATFORM.restaurants) * 100)}%
                </span>
                <span
                  data-num
                  className="min-w-[26px] text-right text-sm font-semibold tabular-nums"
                >
                  {plan.count}
                </span>
                <span
                  data-num
                  className="text-fg-subtle min-w-[58px] text-right text-xs tabular-nums"
                >
                  {short(plan.priceTiyin * plan.count)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div
        data-split
        className="grid [grid-template-columns:minmax(0,1.75fr)_minmax(0,1fr)] items-start gap-5"
      >
        <section className={`${CARD} overflow-x-auto`} data-table>
          <div className="min-w-[980px]">
            <div
              className={`bg-bg-subtle text-fg-subtle grid ${COLUMNS} border-b py-[11px] text-xs font-semibold tracking-wide`}
            >
              <span>{col('restaurant')}</span>
              <span>{col('plan')}</span>
              <span className="text-right">{col('branches')}</span>
              <span className="text-right">{col('users')}</span>
              <span>{col('lastSeen')}</span>
              <span>{col('billing')}</span>
              <span className="text-right">{col('monthly')}</span>
            </div>

            {TENANTS.map((tenant) => {
              const billing = BILLING_LABEL[tenant.billing];

              return (
                <Link
                  key={tenant.id}
                  href={`/tenants/${tenant.id}`}
                  data-row
                  className={`border-divider grid ${COLUMNS} items-center border-b py-[13px] text-left`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{tenant.name}</span>
                    <span className="text-fg-subtle mt-0.5 block text-xs">{tenant.city}</span>
                  </span>

                  <span>
                    <span
                      className={`rounded-pill text-2xs inline-flex px-[9px] py-1 font-semibold ${PLAN_BY_ID[tenant.plan].chip}`}
                    >
                      {tenant.plan}
                    </span>
                  </span>

                  <span data-num className="text-fg-muted text-right text-sm">
                    {tenant.branches}
                  </span>
                  <span data-num className="text-fg-muted text-right text-sm">
                    {tenant.users}
                  </span>
                  <span className="text-fg-muted text-sm">{tenant.lastSeen}</span>

                  <span>
                    <span
                      className={`rounded-pill text-2xs inline-flex px-[9px] py-1 font-semibold whitespace-nowrap ${billing.tone}`}
                    >
                      {state(billing.key)}
                    </span>
                  </span>

                  <span data-num className="text-right text-sm font-semibold">
                    {formatTiyinAmount(tenant.mrrTiyin)}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <div className="flex flex-col gap-5">
          <section className={`${CARD} px-6 py-[22px]`}>
            <h3 className={`${H3} mb-[18px]`}>{t('health')}</h3>

            {HEALTH_ROWS.map((row, index) => (
              <div
                key={HEALTH_KEYS[index]}
                className="border-divider flex items-center justify-between gap-3 border-b py-[11px] last:border-b-0"
              >
                <span className="text-fg-muted text-sm">{health(HEALTH_KEYS[index]!)}</span>
                <span data-num className={`text-sm font-semibold ${row.tone ?? ''}`}>
                  {row.value}
                </span>
              </div>
            ))}
          </section>

          <section className={`${CARD} px-6 py-[22px]`}>
            <h3 className={`${H3} mb-4`}>{t('logs')}</h3>

            {SYSTEM_LOG.map((entry) => (
              <div
                key={entry.time}
                className="border-divider flex gap-3 border-b py-[9px] last:border-b-0"
              >
                <span
                  aria-hidden
                  className={`rounded-pill mt-1.5 size-[7px] flex-none ${LOG_DOT[entry.level]}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-fg-muted block text-xs leading-normal">{entry.text}</span>
                  <span data-num className="text-fg-subtle text-2xs mt-[3px] block">
                    {entry.time}
                  </span>
                </span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </>
  );
}
