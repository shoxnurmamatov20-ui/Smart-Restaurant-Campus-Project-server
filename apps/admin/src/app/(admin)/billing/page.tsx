import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { formatTiyinAmount } from '@restaurant/utils';

import { ACTION, ACTION_PRIMARY, StatStrip } from '../screen';
import { BILLING_LABEL, BILLING_SUMMARY, INVOICES, PLATFORM } from '../platform-data';

export async function generateMetadata() {
  const nav = await getTranslations('platform.nav');
  return { title: nav('billing') };
}

/**
 * What the platform is owed, and what it has collected.
 *
 * Built to the design's billing view: four figures, then every invoice for the
 * month with the ones still open marked.
 *
 * Overdue is sorted to the top rather than left in invoice order. This is a
 * worklist — somebody works down it making calls — and a list that opens on the
 * accounts that are fine is a list that gets skimmed.
 *
 * TODO — once the platform API lands:
 *   - Marking an invoice paid, and the receipt that follows
 *   - Dunning: the day-3, day-7 and day-14 notices Settings already configures
 *   - Suspension after fourteen days, with the ninety-day data retention
 *   - Payme and Click reconciliation
 */
const COLUMNS =
  '[grid-template-columns:150px_minmax(0,1.4fr)_130px_120px_minmax(0,1fr)_160px_130px] gap-4 px-5';

export default async function BillingPage() {
  const t = await getTranslations('platform.billing');
  const col = await getTranslations('platform.columns');
  const state = await getTranslations('platform.state');
  const method = await getTranslations('platform.method');

  /* Overdue, then pending, then paid. */
  const rank = { 0: 0, 2: 1, 1: 2 } as const;
  const rows = [...INVOICES].sort(
    (a, b) => rank[a.tenant.billing] - rank[b.tenant.billing] || a.id.localeCompare(b.id),
  );

  return (
    <>
      <div data-pagehead className="mb-[18px] flex items-center justify-between gap-4">
        <p className="text-fg-muted text-sm">
          {t('overdueTotal')} · <span data-num>{PLATFORM.paymentIssues}</span>
        </p>

        <div className="flex gap-2">
          <button type="button" className={ACTION}>
            {t('remind')}
          </button>
          <button type="button" className={ACTION_PRIMARY}>
            {t('sendInvoice')}
          </button>
        </div>
      </div>

      <StatStrip
        wide
        stats={[
          { label: t('collected'), value: formatTiyinAmount(BILLING_SUMMARY.collectedTiyin) },
          {
            label: t('overdueTotal'),
            value: formatTiyinAmount(BILLING_SUMMARY.overdueTiyin),
            tone: 'text-danger-700',
          },
          { label: t('arpu'), value: formatTiyinAmount(BILLING_SUMMARY.arpuTiyin) },
          { label: t('churn'), value: BILLING_SUMMARY.churn },
        ]}
      />

      <div className="bg-surface overflow-hidden rounded-lg border" data-table>
        <div
          className={`bg-bg-subtle text-fg-subtle grid ${COLUMNS} border-b py-[11px] text-xs font-semibold tracking-wide`}
        >
          <span>{col('invoice')}</span>
          <span>{col('restaurant')}</span>
          <span>{col('plan')}</span>
          <span>{col('date')}</span>
          <span className="text-right">{col('amount')}</span>
          <span>{col('method')}</span>
          <span>{col('status')}</span>
        </div>

        {rows.map((invoice) => {
          const billing = BILLING_LABEL[invoice.tenant.billing];

          return (
            <Link
              key={invoice.id}
              href={`/tenants/${invoice.tenant.id}`}
              data-row
              className={`border-divider grid ${COLUMNS} items-center border-b py-[13px] text-left`}
            >
              <span className="text-fg-muted font-mono text-xs">{invoice.id}</span>
              <span className="truncate text-sm font-semibold">{invoice.tenant.name}</span>
              <span className="text-fg-muted text-sm">{invoice.tenant.plan}</span>
              <span data-num className="text-fg-muted text-sm">
                {invoice.date}
              </span>
              <span data-num className="text-right text-sm font-semibold">
                {formatTiyinAmount(invoice.tenant.mrrTiyin)}
              </span>
              <span className="text-fg-muted text-sm">{method(invoice.method)}</span>
              <span>
                <span
                  className={`rounded-pill text-2xs inline-flex px-[9px] py-1 font-semibold whitespace-nowrap ${billing.tone}`}
                >
                  {state(billing.key)}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
