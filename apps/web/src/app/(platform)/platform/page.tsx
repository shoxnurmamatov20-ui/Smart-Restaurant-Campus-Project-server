import { getLocale, getTranslations } from 'next-intl/server';
import { formatNumber, formatTiyinAmount } from '@restaurant/utils';
import {
  DataHead,
  DataTable,
  DataTd,
  DataTh,
  DataTr,
  Donut,
  KpiCard,
  KpiRow,
  LineChart,
  PageHead,
  Panel,
  PanelHead,
  StatusChip,
} from '@restaurant/ui';

import { todayLabel } from '@/lib/today-label';

import { type PayState, type PlanId } from './platform-data';
import { platformOverview } from './platform-server';
import { OVERVIEW_GLYPH } from './overview-glyphs';

export async function generateMetadata() {
  const t = await getTranslations('console.dashSuper');
  return { title: t('greeting') };
}

/**
 * The platform operator's overview.
 *
 * The design's §3.2 row for `super`, and the eighth role's home screen. Four
 * figures about the business of running the platform, twelve months of growth
 * and the tenant list on the left, the plan split and system health on the
 * right.
 *
 * "Last seen" is a deliberate column. An operator's job is noticing the
 * restaurant that stopped using the product three days ago, and no revenue
 * figure surfaces that — a tenant on an annual plan looks healthy in MRR right
 * up to the renewal they do not sign.
 */
export default async function PlatformPage() {
  const [data, t, shared, city] = await Promise.all([
    platformOverview(),
    getTranslations('console.dashSuper'),
    getTranslations('console.dashboard'),
    getTranslations('console.city'),
  ]);

  const PLAN_LABEL: Record<PlanId, string> = {
    start: 'Start',
    growth: 'Growth',
    enterprise: 'Enterprise',
  };

  const PAY_TONE: Record<PayState, 'success' | 'warning' | 'danger'> = {
    paid: 'success',
    late: 'warning',
    failing: 'danger',
  };

  /**
   * The growth chip, from the series' own first and last points.
   *
   * Null when there is no series, or when the first point is zero — a
   * percentage change from nothing is not a percentage.
   */
  const first = data.growth[0];
  const last = data.growth[data.growth.length - 1];
  const growthDelta =
    first === undefined || last === undefined || first === 0
      ? null
      : ((last - first) / first) * 100;

  /** Minutes since last activity, said the way a person would say it. */
  function seen(minutes: number): string {
    if (minutes < 60) return `${minutes}′`;
    if (minutes < 1_440) return `${Math.round(minutes / 60)} h`;
    return `${Math.round(minutes / 1_440)} d`;
  }

  return (
    <>
      {/*
       * The lede states the same three figures the cards beneath it do.
       *
       * It used to be a sentence — "Qirq ikkita restoran, 118 filial. Ikkitasida
       * to'lov muammosi bor." — over live KPIs that said something else, so the
       * first two lines of the platform console contradicted each other.
       *
       * No period control here. The design draws the week/month toggle the seven
       * role dashboards carry, but `platformOverview()` takes no period and
       * `Segmented` is uncontrolled: clicking it moved a highlight and changed
       * no figure on the page. It comes back with a `?period=` the endpoint
       * reads, as `period-toggle.tsx` does.
       */}
      <PageHead
        eyebrow={todayLabel(await getLocale(), new Date())}
        title={t('greeting')}
        lede={t('ledeLive', {
          tenants: data.tenants,
          branches: data.branchesActive,
          failing: data.failing,
        })}
      />

      <KpiRow aria-label={shared('kpiLabel')}>
        {/*
         * No deltas and no targets except the one that is arithmetic.
         *
         * `+3`, `+4.6%`, `attainment={100}` and `attainment={82}` were literals:
         * the platform console reported the same growth every day of its life,
         * and the rails measured against sentences — "oyiga +3 reja", "yillik
         * reja 3.2 mlrd" — that nothing on the platform holds. There is no
         * targets endpoint, so the cards state the figure and stop. The branch
         * rail stays because both of its numbers come from the same payload.
         */}
        <KpiCard
          label={t('kTenants')}
          {...OVERVIEW_GLYPH.tenants}
          value={formatNumber(data.tenants)}
          unit={t('tenants')}
        />
        <KpiCard
          label={t('kBranches')}
          {...OVERVIEW_GLYPH.branches}
          value={formatNumber(data.branchesActive)}
          unit={t('active')}
          attainment={
            data.branchesTotal === 0 ? null : (data.branchesActive / data.branchesTotal) * 100
          }
          target={t('targetBranchesOf', { total: formatNumber(data.branchesTotal) })}
          railTone="accent"
        />
        <KpiCard
          label={t('kMrr')}
          {...OVERVIEW_GLYPH.mrr}
          value={formatTiyinAmount(data.mrr)}
          unit={t('som')}
        />
        <KpiCard
          label={t('kFailing')}
          {...OVERVIEW_GLYPH.failing}
          value={formatNumber(data.failing)}
          unit={t('tenants')}
        />
      </KpiRow>

      <div data-split className="grid [grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)] gap-5">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel>
            <PanelHead
              title={t('growth')}
              subtitle={t('growthSub')}
              /*
               * The chip was `+81.4%`, a literal, over a fixture curve. It is
               * computed from the series' own ends now, so it can only exist
               * when there is a series — and there is one only in the
               * placeholder console, because `/platform/overview` publishes no
               * monthly revenue.
               */
              action={
                growthDelta === null ? null : (
                  <span
                    data-num
                    className={`text-xs font-semibold ${
                      growthDelta >= 0 ? 'text-success-700' : 'text-danger-600'
                    }`}
                  >
                    {growthDelta >= 0 ? '+' : '−'}
                    {Math.abs(growthDelta).toFixed(1)}%
                  </span>
                )
              }
            />
            {data.growth.length === 0 ? (
              <p className="text-fg-subtle px-1 py-6 text-sm">{t('growthUnavailable')}</p>
            ) : (
              <LineChart points={[...data.growth]} label={t('growthSub')} />
            )}
          </Panel>

          <Panel>
            <PanelHead title={t('tenantList')} subtitle={t('tenantSub')} />

            <DataTable minWidth={860}>
              <DataHead>
                <tr>
                  <DataTh>{t('colTenant')}</DataTh>
                  <DataTh>{t('colCity')}</DataTh>
                  <DataTh>{t('colPlan')}</DataTh>
                  <DataTh align="right">{t('colBranches')}</DataTh>
                  <DataTh align="right">{t('colUsers')}</DataTh>
                  <DataTh align="right">{t('colMrr')}</DataTh>
                  <DataTh align="right">{t('colSeen')}</DataTh>
                </tr>
              </DataHead>
              <tbody>
                {data.list.map((tenant) => (
                  <DataTr key={tenant.id}>
                    <DataTd>
                      <span className="flex items-center gap-2.5">
                        <StatusChip tone={PAY_TONE[tenant.pay]} dot className="flex-none">
                          {PLAN_LABEL[tenant.plan]}
                        </StatusChip>
                        <span className="truncate font-medium">{tenant.name}</span>
                      </span>
                    </DataTd>
                    <DataTd className="text-fg-muted">{city(tenant.city)}</DataTd>
                    <DataTd className="text-fg-muted">{PLAN_LABEL[tenant.plan]}</DataTd>
                    <DataTd align="right" numeric>
                      {formatNumber(tenant.branches)}
                    </DataTd>
                    <DataTd align="right" numeric>
                      {formatNumber(tenant.users)}
                    </DataTd>
                    <DataTd align="right" numeric className="font-semibold">
                      {formatTiyinAmount(tenant.mrr)}
                    </DataTd>
                    <DataTd align="right" numeric className="text-fg-subtle">
                      {seen(tenant.seenMinutes)}
                    </DataTd>
                  </DataTr>
                ))}
              </tbody>
            </DataTable>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel>
            <PanelHead title={t('plans')} subtitle={t('plansSub')} />

            <Donut
              total={formatNumber(data.tenants)}
              totalLabel={t('tenants')}
              slices={data.plans.map((plan, index) => ({
                key: plan.id,
                label: PLAN_LABEL[plan.id],
                value: plan.tenants,
                colour: ['var(--n-300)', 'var(--brand-500)', 'var(--accent-500)'][index] as string,
              }))}
            />
          </Panel>

          <Panel>
            <PanelHead title={t('health')} subtitle={t('healthSub')} />

            {data.health.length === 0 ? (
              <p className="text-fg-subtle px-1 py-4 text-sm">{t('healthUnavailable')}</p>
            ) : null}

            <div className="flex flex-col gap-2.5">
              {data.health.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm">{t(row.id)}</span>
                  <span className="flex flex-none items-center gap-2.5">
                    <span data-num className="text-fg-subtle text-xs">
                      {row.reading}
                    </span>
                    <StatusChip tone={row.status === 'healthy' ? 'success' : 'warning'} dot>
                      {row.status === 'healthy' ? t('healthy') : t('degraded')}
                    </StatusChip>
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
