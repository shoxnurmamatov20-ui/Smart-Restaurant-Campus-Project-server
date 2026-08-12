import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { formatNumber, formatTiyinAmount } from '@restaurant/utils';
import {
  Donut,
  KpiCard,
  KpiRow,
  Legend,
  PageHead,
  Panel,
  PanelHead,
  Segmented,
  StatusChip,
} from '@restaurant/ui';

import { getAccountantOverview, type PaymentMethod, type TaxLine } from './accountant-data';

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
export async function AccountantDashboard() {
  const [data, t, shared] = await Promise.all([
    getAccountantOverview(),
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
  const peak = Math.max(...data.cashflow.flatMap((month) => [month.inflow, month.outflow]));

  return (
    <>
      <PageHead
        eyebrow={shared('date')}
        title={t('greeting', { name: data.greetingName })}
        lede={t('lede')}
        action={
          <Segmented
            aria-label={shared('kpiLabel')}
            defaultValue="month"
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
          label={t('kRevenueMtd')}
          value={formatTiyinAmount(data.revenueMtd)}
          unit={t('som')}
          delta="+9.2%"
          deltaTone="success"
          attainment={(data.revenueMtd / som(620_000_000)) * 100}
          target={t('targetRevenueMtd')}
          railTone="brand"
        />
        <KpiCard
          label={t('kExpenses')}
          value={formatTiyinAmount(data.expenses)}
          unit={t('som')}
          attainment={(data.expenses / data.expenseBudget) * 100}
          target={t('targetExpenses')}
          railTone={data.expenses > data.expenseBudget ? 'danger' : 'warning'}
        />
        <KpiCard
          label={t('kMargin')}
          value={`${data.netMargin.toFixed(1)}%`}
          delta="+1.1"
          deltaTone="success"
          attainment={(data.netMargin / 18) * 100}
          target={t('targetMargin')}
          railTone="accent"
        />
        <KpiCard
          label={t('kUnpaid')}
          value={formatNumber(data.unpaidInvoices)}
          unit={t('invoices')}
          delta={`${data.overdueInvoices} ${t('overdue')}`}
          deltaTone="danger"
          attainment={(data.overdueInvoices / data.unpaidInvoices) * 100}
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
              <div key={month.id} data-num className="text-fg-subtle text-2xs flex-1 text-center">
                {month.label}
              </div>
            ))}
          </div>
        </Panel>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel>
            <PanelHead title={t('methods')} subtitle={t('methodsSub')} />

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
                      <span className="block truncate text-sm font-medium">{payment.supplier}</span>
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
          </Panel>

          <Panel>
            <PanelHead title={t('taxes')} subtitle={t('vatDue')} />

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
