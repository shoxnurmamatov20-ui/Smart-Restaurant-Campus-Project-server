import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { formatNumber, formatTiyinAmount } from '@restaurant/utils';
import {
  CellBar,
  DataHead,
  DataTable,
  DataTd,
  DataTh,
  DataTr,
  Donut,
  KpiCard,
  KpiRow,
  PageHead,
  Panel,
  PanelHead,
  Segmented,
  StatusChip,
} from '@restaurant/ui';

import { getWarehouseOverview, type Delivery } from './warehouse-data';

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
export async function WarehouseDashboard() {
  const [data, t, shared] = await Promise.all([
    getWarehouseOverview(),
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

  return (
    <>
      <PageHead
        eyebrow={shared('date')}
        title={t('greeting', { name: data.greetingName })}
        lede={t('lede')}
        action={
          <Segmented
            aria-label={shared('kpiLabel')}
            segments={[
              { value: 'today', label: shared('periodToday') },
              { value: 'week', label: shared('periodWeek') },
              { value: 'month', label: shared('periodMonth') },
            ]}
          />
        }
      />

      <KpiRow aria-label={shared('kpiLabel')}>
        <KpiCard
          label={t('kLow')}
          value={formatNumber(data.lowStock)}
          unit={t('positions')}
          attainment={(data.lowStock / 2) * 100}
          target={t('targetLow')}
          railTone={data.lowStock > 2 ? 'danger' : 'success'}
        />
        <KpiCard
          label={t('kExpiring')}
          value={formatNumber(data.expiring)}
          unit={t('positions')}
          attainment={(data.expiring / 4) * 100}
          target={t('targetExpiring')}
          railTone="warning"
        />
        <KpiCard
          label={t('kDeliveries')}
          value={formatNumber(data.deliveriesToday)}
          unit={t('deliveries')}
          attainment={(data.deliveriesAccepted / data.deliveriesToday) * 100}
          target={t('targetDeliveries')}
          railTone="brand"
        />
        <KpiCard
          label={t('kWaste')}
          value={`${data.wastePercent.toFixed(1)}%`}
          delta="+0.3"
          deltaTone="danger"
          attainment={(data.wastePercent / 1.5) * 100}
          target={t('targetWaste')}
          railTone={data.wastePercent > 1.5 ? 'danger' : 'success'}
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
          </Panel>

          <Panel>
            <PanelHead title={t('consumed')} subtitle={t('consumedSub')} />

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
          </Panel>
        </div>

        <Panel>
          <PanelHead title={t('stockTitle')} subtitle={t('stockSub')} />

          <Donut
            total={formatNumber(
              data.stock.ok + data.stock.low + data.stock.out + data.stock.expiring,
            )}
            totalLabel={t('positions')}
            slices={[
              {
                key: 'ok',
                label: t('stockOk'),
                value: data.stock.ok,
                colour: 'var(--success-500)',
              },
              {
                key: 'expiring',
                label: t('stockExpiring'),
                value: data.stock.expiring,
                colour: 'var(--warning-500)',
              },
              {
                key: 'low',
                label: t('stockLow'),
                value: data.stock.low,
                colour: 'var(--brand-500)',
              },
              {
                key: 'out',
                label: t('stockOut'),
                value: data.stock.out,
                colour: 'var(--danger-500)',
              },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
