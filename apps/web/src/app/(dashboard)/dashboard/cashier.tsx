import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatNumber, formatTiyinAmount } from '@restaurant/utils';
import {
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
} from '@restaurant/ui';

import { todayLabel } from '@/lib/today-label';

import { type Period } from './overview-data';
import { PeriodToggle } from './period-toggle';
import { GLYPH } from './kpi-icons';

import { type PaymentMethodId } from './cashier-data';
import { getCashierLive } from './dashboard-server';
import { rail, show } from './figures';

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
export async function CashierDashboard({ period = 'today' }: { period?: Period }) {
  const [data, t, shared] = await Promise.all([
    getCashierLive(period),
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
        eyebrow={todayLabel(await getLocale(), new Date())}
        title={t('greeting', { name: data.greetingName })}
        lede={
          data.live
            ? t('ledeLive', { place: data.placeName, count: data.tablesAwaiting ?? 0 })
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
          A drawer nobody opened is a dash and the words "no shift open", never
          a sum. This is the one figure on the platform where an invented value
          produces a real accusation: a count against a demo balance is short by
          whatever the demo said was in it.
        */}
        <KpiCard
          label={t('kDrawer')}
          {...GLYPH.revenueGood}
          value={show(data.drawer, formatTiyinAmount)}
          unit={data.drawer === null && data.live ? t('noShift') : t('som')}
          attainment={null}
          target={data.live ? undefined : t('targetDrawer')}
        />
        <KpiCard
          label={t('kPayments')}
          {...GLYPH.payments}
          value={show(data.payments, formatNumber)}
          unit={t('payments')}
          attainment={rail(data.live, data.payments, 96)}
          target={t('targetPayments')}
          railTone="brand"
        />
        <KpiCard
          label={t('kRefunds')}
          {...GLYPH.refunds}
          value={show(data.refunds, formatNumber)}
          unit={t('payments')}
          attainment={rail(data.live, data.refunds, 2)}
          target={t('targetRefunds')}
          railTone={(data.refunds ?? 0) > 2 ? 'danger' : 'success'}
        />
        {/*
          `targetAwaiting` — "the oldest has waited 26 minutes" — is dropped on
          a live till. A target that is a made-up elapsed time is not a target.
        */}
        <KpiCard
          label={t('kAwaiting')}
          {...GLYPH.awaiting}
          value={show(data.tablesAwaiting, formatNumber)}
          unit={t('tables')}
          attainment={null}
          target={data.live ? undefined : t('targetAwaiting')}
        />
      </KpiRow>

      <div data-split className="grid [grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)] gap-5">
        <Panel>
          <PanelHead title={t('recent')} subtitle={t('recentSub')} />

          {data.recent.length === 0 ? (
            <EmptyState className="py-4">{t('recentEmpty')}</EmptyState>
          ) : (
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
          )}
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

            {data.methods.length === 0 ? (
              <EmptyState className="py-4">{t('methodsEmpty')}</EmptyState>
            ) : (
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
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
