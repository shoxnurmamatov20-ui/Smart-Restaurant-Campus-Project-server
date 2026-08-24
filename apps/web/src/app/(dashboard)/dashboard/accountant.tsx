import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatNumber, formatTiyinAmount } from '@restaurant/utils';
import {
  Donut,
  EmptyState,
  KpiCard,
  KpiRow,
  Legend,
  PageHead,
  Panel,
  PanelHead,
  StatusChip,
} from '@restaurant/ui';

import { todayLabel } from '@/lib/today-label';

import { type Period } from './overview-data';
import { PeriodToggle } from './period-toggle';
import { GLYPH } from './kpi-icons';

import { type PaymentMethod, type TaxLine } from './accountant-data';
import { getAccountantLive } from './dashboard-server';
import { DASH, delta, peakOf, rail, show } from './figures';

/**
 * The accountant's finance dashboard.
 *
 * The design's §3.2 row: four figures about the month, six months of cash flow
 * on the left, and the three things that need chasing on the right — where the
 * money came in, what is due, and where the returns stand.
 *
 * Nothing here touches an order. That is the whole shape of this role: the
 * accountant reads what the shift produced and never the shift itself, which is
 * why the sidebar for this role has no Orders row and this screen has no link
 * to one.
 */
export async function AccountantDashboard({ period = 'today' }: { period?: Period }) {
  const [data, t, shared] = await Promise.all([
    getAccountantLive(period),
    getTranslations('console.dashAccountant'),
    getTranslations('console.dashboard'),
  ]);

  const METHOD_LABEL: Record<PaymentMethod['id'], string> = {
    cash: t('methodCash'),
    card: t('methodCard'),
    wallet: t('methodWallet'),
    transfer: t('methodTransfer'),
  };

  const TAX_LABEL: Record<TaxLine['id'], string> = {
    vat: t('vat'),
    income: t('income'),
    social: t('social'),
  };

  const methodTotal = data.methods.reduce((sum, method) => sum + method.amount, 0);
  // Seeded with zero: a business with no closed month used to be shown six
  // months of invented trading rather than an empty chart, because spreading
  // an empty array into `Math.max` is `-Infinity`.
  const peak = peakOf(data.cashflow.flatMap((month) => [month.inflow, month.outflow]));

  return (
    <>
      <PageHead
        eyebrow={todayLabel(await getLocale(), new Date())}
        title={t('greeting', { name: data.greetingName })}
        lede={
          data.live
            ? data.revenueMtd === null || data.expenses === null
              ? undefined
              : t('ledeLive', {
                  place: data.placeName,
                  revenue: formatTiyinAmount(data.revenueMtd),
                  expenses: formatTiyinAmount(data.expenses),
                })
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
          The monthly plan, the expense budget and the 18% margin target are the
          design's, and a business that has set none of them is not behind on
          any of them. `rail()` drops all three on a live tenant, and the two
          delta chips go with them — a green `+9.2%` beside a real revenue
          figure reads as growth somebody achieved.
        */}
        <KpiCard
          label={t('kRevenueMtd')}
          {...GLYPH.revenue}
          value={show(data.revenueMtd, formatTiyinAmount)}
          unit={t('som')}
          delta={delta(data.live, '+9.2%')}
          deltaTone="success"
          attainment={rail(data.live, data.revenueMtd, som(620_000_000))}
          target={t('targetRevenueMtd')}
          railTone="brand"
        />
        <KpiCard
          label={t('kExpenses')}
          {...GLYPH.expenses}
          value={show(data.expenses, formatTiyinAmount)}
          unit={t('som')}
          attainment={rail(data.live, data.expenses, data.expenseBudget ?? 0)}
          target={t('targetExpenses')}
          railTone={(data.expenses ?? 0) > (data.expenseBudget ?? Infinity) ? 'danger' : 'warning'}
        />
        <KpiCard
          label={t('kMargin')}
          {...GLYPH.profit}
          value={data.netMargin === null ? DASH : `${data.netMargin.toFixed(1)}%`}
          delta={delta(data.live, '+1.1')}
          deltaTone="success"
          attainment={rail(data.live, data.netMargin, 18)}
          target={t('targetMargin')}
          railTone="accent"
        />
        <KpiCard
          label={t('kUnpaid')}
          {...GLYPH.due}
          value={show(data.unpaidInvoices, formatNumber)}
          unit={t('invoices')}
          delta={
            data.overdueInvoices === null ? undefined : `${data.overdueInvoices} ${t('overdue')}`
          }
          deltaTone="danger"
          attainment={rail(data.live, data.overdueInvoices, data.unpaidInvoices ?? 0)}
          target={t('targetUnpaid')}
          railTone="danger"
        />
      </KpiRow>

      <div data-split className="grid [grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)] gap-5">
        <Panel>
          <PanelHead
            title={t('cashflow')}
            subtitle={t('cashflowSub')}
            action={
              <>
                <Legend colour="bg-brand-500">{shared('legendToday')}</Legend>
                <Legend colour="bg-warning-500">{t('kExpenses')}</Legend>
              </>
            }
          />

          {data.cashflow.length === 0 ? (
            <EmptyState className="py-4">{t('cashflowEmpty')}</EmptyState>
          ) : (
            <>
              {/* Paired bars rather than the single series `BarChart` draws: the
                comparison here is in against out, and two rows of bars would ask
                the reader to hold one month in their head while finding it in the
                other chart. Heights in px, for the reason the primitive states. */}
              <div className="flex items-end gap-4" style={{ height: 200 }} role="img" aria-hidden>
                {data.cashflow.map((month) => (
                  <div key={month.id} className="flex h-full flex-1 items-end gap-1">
                    <div
                      className="flex-1 rounded-t-[3px]"
                      style={{
                        height: `${Math.max(2, Math.round((month.inflow / peak) * 200))}px`,
                        background: 'var(--brand-500)',
                      }}
                    />
                    <div
                      className="flex-1 rounded-t-[3px]"
                      style={{
                        height: `${Math.max(2, Math.round((month.outflow / peak) * 200))}px`,
                        background: 'var(--warning-500)',
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-2.5 flex gap-4">
                {data.cashflow.map((month) => (
                  <div
                    key={month.id}
                    data-num
                    className="text-fg-subtle text-2xs flex-1 text-center"
                  >
                    {month.label}
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-5">
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
                  colour: [
                    'var(--brand-500)',
                    'var(--accent-500)',
                    'var(--warning-500)',
                    'var(--n-300)',
                  ][index] as string,
                  display: formatTiyinAmount(method.amount),
                }))}
              />
            )}
          </Panel>

          <Panel>
            <PanelHead
              title={t('upcoming')}
              subtitle={t('upcomingSub')}
              action={
                <Link href="/finance/books" className="text-fg-brand text-xs font-semibold">
                  {t('openBooks')}
                </Link>
              }
            />

            {data.upcoming.length === 0 ? (
              <EmptyState className="py-4">{t('upcomingEmpty')}</EmptyState>
            ) : (
              <div className="flex flex-col gap-0.5">
                {data.upcoming.map((payment) => {
                  const late = payment.daysUntilDue < 0;

                  return (
                    <div
                      key={payment.id}
                      data-row
                      className="-mx-2 flex items-center gap-3 rounded-sm px-2 py-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {payment.supplier}
                        </span>
                        <span
                          data-num
                          className={`text-2xs block ${late ? 'text-danger-700 font-semibold' : 'text-fg-subtle'}`}
                        >
                          {late
                            ? `${Math.abs(payment.daysUntilDue)} ${t('overdue')}`
                            : t('inDays', { days: payment.daysUntilDue })}
                        </span>
                      </span>
                      <span data-num className="flex-none text-sm font-semibold">
                        {formatTiyinAmount(payment.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHead title={t('taxes')} subtitle={data.live ? undefined : t('vatDue')} />

            {data.taxes.length === 0 ? (
              <EmptyState className="py-4">{t('taxesEmpty')}</EmptyState>
            ) : (
              <div className="flex flex-col gap-2.5">
                {data.taxes.map((tax) => (
                  <div key={tax.id} className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm">{TAX_LABEL[tax.id]}</span>
                    <StatusChip tone={tax.status === 'ready' ? 'success' : 'warning'} dot>
                      {tax.status === 'ready' ? t('ready') : t('pending')}
                    </StatusChip>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

/** 1 UZS = 100 tiyin. Local to the target arithmetic above. */
function som(value: number): number {
  return value * 100;
}
