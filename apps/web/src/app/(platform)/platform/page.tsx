import { getTranslations } from 'next-intl/server';
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
  Segmented,
  StatusChip,
} from '@restaurant/ui';

import { getPlatformOverview, type PayState, type PlanId } from './platform-data';

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
    getPlatformOverview(),
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

  /** Minutes since last activity, said the way a person would say it. */
  function seen(minutes: number): string {
    if (minutes < 60) return `${minutes}′`;
    if (minutes < 1_440) return `${Math.round(minutes / 60)} h`;
    return `${Math.round(minutes / 1_440)} d`;
  }

  return (
    <>
      <PageHead
        eyebrow={shared('date')}
        title={t('greeting')}
        lede={t('lede')}
        action={
          <Segmented
            aria-label={shared('kpiLabel')}
            defaultValue="month"
            segments={[
              { value: 'week', label: shared('periodWeek') },
              { value: 'month', label: shared('periodMonth') },
            ]}
          />
        }
      />

      <KpiRow aria-label={shared('kpiLabel')}>
        <KpiCard
          label={t('kTenants')}
          value={formatNumber(data.tenants)}
          unit={t('tenants')}
          delta="+3"
          deltaTone="success"
          attainment={100}
          target={t('targetTenants')}
          railTone="brand"
        />
        <KpiCard
          label={t('kBranches')}
          value={formatNumber(data.branchesActive)}
          unit={t('active')}
          attainment={(data.branchesActive / data.branchesTotal) * 100}
          target={t('targetBranches')}
          railTone="accent"
        />
        <KpiCard
          label={t('kMrr')}
          value={formatTiyinAmount(data.mrr)}
          unit={t('som')}
          delta="+4.6%"
          deltaTone="success"
          attainment={82}
          target={t('targetMrr')}
          railTone="brand"
        />
        <KpiCard
          label={t('kFailing')}
          value={formatNumber(data.failing)}
          unit={t('tenants')}
          attainment={(data.failing / 1) * 100}
          target={t('targetFailing')}
          railTone="danger"
        />
      </KpiRow>

      <div data-split className="grid [grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)] gap-5">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel>
            <PanelHead
              title={t('growth')}
              subtitle={t('growthSub')}
              action={
                <span data-num className="text-success-700 text-xs font-semibold">
                  +81.4%
                </span>
              }
            />
            <LineChart points={[...data.growth]} label={t('growthSub')} />
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
