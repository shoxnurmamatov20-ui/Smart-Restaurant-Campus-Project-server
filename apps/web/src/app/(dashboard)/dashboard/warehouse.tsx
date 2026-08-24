import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatNumber, formatTiyinAmount } from '@restaurant/utils';
import {
  CellBar,
  DataHead,
  DataTable,
  DataTd,
  DataTh,
  DataTr,
  Donut,
  EmptyState,
  KpiCard,
  KpiRow,
  PageHead,
  Panel,
  PanelHead,
  StatusChip,
} from '@restaurant/ui';

import { todayLabel } from '@/lib/today-label';

import { type Period } from './overview-data';
import { PeriodToggle } from './period-toggle';
import { GLYPH } from './kpi-icons';

import { type Delivery } from './warehouse-data';
import { getWarehouseLive } from './dashboard-server';
import { DASH, delta, rail, show } from './figures';

/**
 * The storekeeper's stock dashboard.
 *
 * The design's §3.2 row: what is short, what is about to spoil, what is
 * arriving, and what the kitchen is actually getting through.
 *
 * Waste is stated as a share rather than a sum on purpose. A storekeeper who is
 * shown "1 240 000 so'm thrown away" has been handed an accusation; one who is
 * shown "1.8% against a 1.5% ceiling" has been handed a target.
 */
export async function WarehouseDashboard({ period = 'today' }: { period?: Period }) {
  const [data, t, shared] = await Promise.all([
    getWarehouseLive(period),
    getTranslations('console.dashWarehouse'),
    getTranslations('console.dashboard'),
  ]);

  const DELIVERY_STATUS: Record<
    Delivery['status'],
    { label: string; tone: 'success' | 'brand' | 'danger' }
  > = {
    accepted: { label: t('stAccepted'), tone: 'success' },
    onWay: { label: t('stOnWay'), tone: 'brand' },
    late: { label: t('stLate'), tone: 'danger' },
  };

  const shelf = data.stock;

  return (
    <>
      <PageHead
        eyebrow={todayLabel(await getLocale(), new Date())}
        title={t('greeting', { name: data.greetingName })}
        lede={
          data.live
            ? t('ledeLive', { low: data.lowStock ?? 0, expiring: data.expiring ?? 0 })
            : t('lede')
        }
        action={
          <PeriodToggle
            current={period}
            ariaLabel={shared('kpiLabel')}
            labels={{
              today: shared('periodToday'),
              week: shared('periodWeek'),
              month: shared('periodMonth'),
            }}
          />
        }
      />

      <KpiRow aria-label={shared('kpiLabel')}>
        {/*
          The par level, the seven-day window and the 1.5% waste ceiling are
          thresholds out of the design, not settings this restaurant chose, so
          no rail is drawn against them on a live store. `targetDeliveries` —
          "two accepted" — went with them: it stated a fact under a live figure.
        */}
        <KpiCard
          label={t('kLow')}
          {...GLYPH.lowStock}
          value={show(data.lowStock, formatNumber)}
          unit={t('positions')}
          attainment={rail(data.live, data.lowStock, 2)}
          target={t('targetLow')}
          railTone={(data.lowStock ?? 0) > 2 ? 'danger' : 'success'}
        />
        <KpiCard
          label={t('kExpiring')}
          {...GLYPH.expiring}
          value={show(data.expiring, formatNumber)}
          unit={t('positions')}
          attainment={rail(data.live, data.expiring, 4)}
          target={t('targetExpiring')}
          railTone="warning"
        />
        <KpiCard
          label={t('kDeliveries')}
          {...GLYPH.deliveries}
          value={show(data.deliveriesToday, formatNumber)}
          unit={t('deliveries')}
          attainment={rail(data.live, data.deliveriesAccepted, data.deliveriesToday ?? 0)}
          target={t('targetDeliveries')}
          railTone="brand"
        />
        <KpiCard
          label={t('kWaste')}
          {...GLYPH.waste}
          value={data.wastePercent === null ? DASH : `${data.wastePercent.toFixed(1)}%`}
          delta={delta(data.live, '+0.3')}
          deltaTone="danger"
          attainment={rail(data.live, data.wastePercent, 1.5)}
          target={t('targetWaste')}
          railTone={(data.wastePercent ?? 0) > 1.5 ? 'danger' : 'success'}
        />
      </KpiRow>

      <div data-split className="grid [grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)] gap-5">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel>
            <PanelHead
              title={t('incoming')}
              subtitle={t('incomingSub')}
              action={
                <Link href="/inventory/operations" className="text-fg-brand text-xs font-semibold">
                  {t('openStock')}
                </Link>
              }
            />

            {data.incoming.length === 0 ? (
              <EmptyState className="py-4">{t('incomingEmpty')}</EmptyState>
            ) : (
              <DataTable minWidth={520}>
                <DataHead>
                  <tr>
                    <DataTh>{t('colSupplier')}</DataTh>
                    <DataTh align="right">{t('colItems')}</DataTh>
                    <DataTh align="right">{t('colTime')}</DataTh>
                    <DataTh align="right">{t('colStatus')}</DataTh>
                  </tr>
                </DataHead>
                <tbody>
                  {data.incoming.map((delivery) => (
                    <DataTr key={delivery.id}>
                      <DataTd className="font-medium">{delivery.supplier}</DataTd>
                      <DataTd align="right" numeric>
                        {formatNumber(delivery.items)}
                      </DataTd>
                      <DataTd align="right" numeric className="text-fg-muted">
                        {delivery.time}
                      </DataTd>
                      <DataTd align="right">
                        <StatusChip
                          tone={DELIVERY_STATUS[delivery.status].tone}
                          dot
                          className="ml-auto"
                        >
                          {DELIVERY_STATUS[delivery.status].label}
                        </StatusChip>
                      </DataTd>
                    </DataTr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Panel>

          <Panel>
            <PanelHead title={t('consumed')} subtitle={t('consumedSub')} />

            {data.consumed.length === 0 ? (
              <EmptyState className="py-4">{t('consumedEmpty')}</EmptyState>
            ) : (
              <div className="flex flex-col gap-3">
                {data.consumed.map((item) => (
                  <div key={item.id} className="flex items-center gap-3.5">
                    <span className="w-[112px] flex-none truncate text-sm font-medium">
                      {item.name}
                    </span>
                    <CellBar percent={item.share * 100} fill="var(--brand-500)" label={item.name} />
                    <span data-num className="text-fg-muted w-[74px] flex-none text-right text-xs">
                      {formatNumber(item.quantity)} {item.unit}
                    </span>
                    <span data-num className="w-[100px] flex-none text-right text-sm font-semibold">
                      {formatTiyinAmount(item.cost)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <Panel>
          {/*
            The caption counts what the ring counts. It used to say "142
            positions" from the catalogue while the donut beside it totalled
            zero — a panel contradicting itself in one glance, which is worse
            than either number alone.
          */}
          <PanelHead
            title={t('stockTitle')}
            subtitle={
              shelf === null
                ? undefined
                : t('stockCount', { count: shelf.ok + shelf.low + shelf.out + shelf.expiring })
            }
          />

          {shelf === null ? (
            <EmptyState className="py-4">{t('stockEmpty')}</EmptyState>
          ) : (
            <Donut
              total={formatNumber(shelf.ok + shelf.low + shelf.out + shelf.expiring)}
              totalLabel={t('positions')}
              slices={[
                {
                  key: 'ok',
                  label: t('stockOk'),
                  value: shelf.ok,
                  colour: 'var(--success-500)',
                },
                {
                  key: 'expiring',
                  label: t('stockExpiring'),
                  value: shelf.expiring,
                  colour: 'var(--warning-500)',
                },
                {
                  key: 'low',
                  label: t('stockLow'),
                  value: shelf.low,
                  colour: 'var(--brand-500)',
                },
                {
                  key: 'out',
                  label: t('stockOut'),
                  value: shelf.out,
                  colour: 'var(--danger-500)',
                },
              ]}
            />
          )}
        </Panel>
      </div>
    </>
  );
}
