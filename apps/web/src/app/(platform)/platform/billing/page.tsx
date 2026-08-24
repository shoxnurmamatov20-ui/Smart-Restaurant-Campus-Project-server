import { getLocale, getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { Chip, Head, Stats, Table, Td, Tr, type ChipTone } from '../../platform-ui';
import { type InvoiceState } from '../platform-data';
import { platformInvoices, platformOverview } from '../platform-server';
import { RetryButton } from './retry-button';

export async function generateMetadata() {
  const t = await getTranslations('console.platformNav');
  return { title: t('billing') };
}

/**
 * Payments, and the three that are failing.
 *
 * The attempt count is the column that decides what happens next, so it is on
 * the table rather than in a drawer: one failure is a bank having a bad
 * afternoon, four is a customer who has already left and has not said so.
 *
 * Retry is offered on failures and on nothing else. A button that "retries" a
 * paid invoice is a button that will eventually charge somebody twice.
 */
export default async function BillingPage() {
  const [t, nav, locale] = await Promise.all([
    getTranslations('console.platformBilling'),
    getTranslations('console.platformNav'),
    getLocale(),
  ]);

  const lang = (['uz', 'ru', 'en'].includes(locale) ? locale : 'uz') as 'uz' | 'ru' | 'en';

  const [data, invoices] = await Promise.all([platformOverview(), platformInvoices()]);
  const byId = new Map(data.list.map((tenant) => [tenant.id, tenant]));

  const TONE: Record<InvoiceState, ChipTone> = {
    paid: 'success',
    dunning: 'warning',
    failed: 'danger',
  };

  const failing = invoices.filter((invoice) => invoice.state !== 'paid');
  const atRisk = failing.reduce((sum, invoice) => sum + invoice.amount, 0);

  return (
    <>
      <Head title={nav('billing')} subtitle={t('subtitle')} />

      <Stats
        items={[
          {
            label: t('kpiCollected'),
            value: formatTiyinAmount(data.mrr - atRisk),
            note: t('thisMonth'),
          },
          {
            label: t('kpiFailing'),
            value: String(failing.length),
            note: formatTiyinAmount(atRisk),
            tone: 'danger',
          },
          {
            label: t('kpiRate'),
            value: `${Math.round(((invoices.length - failing.length) / invoices.length) * 100)}%`,
            note: t('kpiRateNote'),
          },
        ]}
      />

      <Table
        head={[
          { label: t('colInvoice') },
          { label: t('colTenant') },
          { label: t('colIssued') },
          { label: t('colAttempts'), align: 'right' },
          { label: t('colAmount'), align: 'right' },
          { label: t('colState'), align: 'right' },
          { label: '', align: 'right' },
        ]}
      >
        {invoices.map((invoice) => (
          <Tr key={invoice.id}>
            <Td numeric className="font-semibold">
              {invoice.id}
            </Td>
            <Td className="font-medium">{byId.get(invoice.tenantId)?.name ?? invoice.tenantId}</Td>
            <Td numeric className="text-fg-muted">
              {invoice.issued}
            </Td>
            <Td
              align="right"
              numeric
              className={invoice.attempts >= 3 ? 'text-danger-600 font-semibold' : 'text-fg-muted'}
            >
              {invoice.attempts}
            </Td>
            <Td align="right" numeric className="font-semibold">
              {formatTiyinAmount(invoice.amount)}
            </Td>
            <Td align="right">
              <Chip tone={TONE[invoice.state]}>{t(`state_${invoice.state}`)}</Chip>
            </Td>
            <Td align="right">
              {invoice.state === 'paid' ? null : (
                <RetryButton
                  invoiceId={invoice.key}
                  lang={lang}
                  label={t('retry')}
                  done={`${invoice.id} ${t('retryDone')}`}
                  failed={t('retryFailed')}
                  demo={t('retryFailedDemo')}
                  className="border-border-strong bg-surface hover:bg-bg-muted h-8 rounded-md border px-3 text-xs font-semibold"
                />
              )}
            </Td>
          </Tr>
        ))}
      </Table>
    </>
  );
}
