import Link from 'next/link';
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
  PageHead,
  Panel,
  PanelHead,
  Segmented,
} from '@restaurant/ui';

import { getCashierOverview, type PaymentMethodId } from './cashier-data';

/**
 * The cashier's till dashboard.
 *
 * The design's §3.2 row: what is in the drawer, what has been taken, what came
 * back, and how many tables are still waiting — then the payment log, the
 * method split, and a button onto the till itself.
 *
 * Cash in the drawer leads because it is the figure the cashier is accountable
 * for at the end of the shift. Everything else on this screen exists to explain
 * how it got to that number.
 */
export async function CashierDashboard() {
  const [data, t, shared] = await Promise.all([
    getCashierOverview(),
    getTranslations('console.dashCashier'),
    getTranslations('console.dashboard'),
  ]);

  const METHOD_LABEL: Record<PaymentMethodId, string> = {
    cash: t('methodCash'),
    card: t('methodCard'),
    wallet: t('methodWallet'),
  };

  const methodTotal = data.methods.reduce((sum, method) => sum + method.amount, 0);

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
            ]}
          />
        }
      />

      <KpiRow aria-label={shared('kpiLabel')}>
        <KpiCard
          label={t('kDrawer')}
          value={formatTiyinAmount(data.drawer)}
          unit={t('som')}
          attainment={null}
          target={t('targetDrawer')}
        />
        <KpiCard
          label={t('kPayments')}
          value={formatNumber(data.payments)}
          unit={t('payments')}
          attainment={(data.payments / 96) * 100}
          target={t('targetPayments')}
          railTone="brand"
        />
        <KpiCard
          label={t('kRefunds')}
          value={formatNumber(data.refunds)}
          unit={t('payments')}
          attainment={(data.refunds / 2) * 100}
          target={t('targetRefunds')}
          railTone={data.refunds > 2 ? 'danger' : 'success'}
        />
        <KpiCard
          label={t('kAwaiting')}
          value={formatNumber(data.tablesAwaiting)}
          unit={t('tables')}
          attainment={null}
          target={t('targetAwaiting')}
        />
      </KpiRow>

      <div data-split className="grid [grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)] gap-5">
        <Panel>
          <PanelHead title={t('recent')} subtitle={t('recentSub')} />

          <DataTable minWidth={480}>
            <DataHead>
              <tr>
                <DataTh>{t('colTime')}</DataTh>
                <DataTh>{t('colOrder')}</DataTh>
                <DataTh>{t('colMethod')}</DataTh>
                <DataTh align="right">{t('colAmount')}</DataTh>
              </tr>
            </DataHead>
            <tbody>
              {data.recent.map((payment) => (
                <DataTr key={payment.id}>
                  <DataTd numeric className="text-fg-muted">
                    {payment.time}
                  </DataTd>
                  <DataTd numeric className="font-medium">
                    {payment.order}
                  </DataTd>
                  <DataTd className="text-fg-muted">{METHOD_LABEL[payment.method]}</DataTd>
                  <DataTd
                    align="right"
                    numeric
                    className={payment.refund ? 'text-danger-700 font-semibold' : 'font-semibold'}
                  >
                    {payment.refund ? '−' : ''}
                    {formatTiyinAmount(payment.amount)}
                  </DataTd>
                </DataTr>
              ))}
            </tbody>
          </DataTable>
        </Panel>

        <div className="flex min-w-0 flex-col gap-5">
          <Link
            href="/finance/till"
            className="bg-brand-500 hover:bg-brand-600 flex flex-col items-center justify-center rounded-lg px-5 py-6 text-center text-white"
          >
            <span className="font-display tracking-snug text-xl font-semibold">{t('goTill')}</span>
            <span className="mt-1 text-xs opacity-85">{t('goTillSub')}</span>
          </Link>

          <Panel>
            <PanelHead title={t('methods')} subtitle={t('methodsSub')} />

            <Donut
              total={formatTiyinAmount(methodTotal)}
              totalLabel={t('som')}
              slices={data.methods.map((method, index) => ({
                key: method.id,
                label: METHOD_LABEL[method.id],
                value: method.amount,
                colour: ['var(--brand-500)', 'var(--accent-500)', 'var(--warning-500)'][
                  index
                ] as string,
                display: formatTiyinAmount(method.amount),
              }))}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}
