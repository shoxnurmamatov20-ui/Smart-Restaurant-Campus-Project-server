import { getTranslations } from 'next-intl/server';

import { moduleMetadata } from '../module-page';
import { ACTION_PRIMARY, PageHead, Row, TableCard } from '../screen';
import { onTimeTone, SUPPLIERS } from './suppliers-data';

export const generateMetadata = () => moduleMetadata('suppliers');

/**
 * Who the restaurant buys from.
 *
 * Built to the design's Suppliers screen. The on-time column is the one that
 * earns the table its place: a supplier at 82% is not a price problem, it is a
 * kitchen that has to hold more stock than it wants to, and the colour says so
 * without anyone running a report.
 *
 * TODO — Phase 1 · suppliers, once the module is built:
 *   - Purchase orders: draft, send, receive against
 *   - Price lists, and what changed since last time
 *   - Payables and the payment schedule
 *   - E-invoices through Didox
 */
const COLUMNS =
  '[grid-template-columns:minmax(0,1.4fr)_140px_120px_120px_130px_minmax(0,1fr)_110px]';

const TONE_TEXT = {
  success: 'text-success-700',
  warning: 'text-warning-700',
  danger: 'text-danger-700',
} as const;

export default async function SuppliersPage() {
  const [nav, t, common] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.suppliers'),
    getTranslations('console.common'),
  ]);

  return (
    <>
      <PageHead title={nav('suppliers')} subtitle={t('subtitle')}>
        <button type="button" className={ACTION_PRIMARY}>
          {t('add')}
        </button>
      </PageHead>

      <TableCard
        columns={COLUMNS}
        head={[
          t('colSupplier'),
          t('colCategory'),
          t('colLead'),
          { label: t('colOnTime'), align: 'right' },
          t('colPurchases'),
          t('colContact'),
          { label: t('colSpend'), align: 'right' },
        ]}
      >
        {SUPPLIERS.map((supplier) => (
          <Row key={supplier.id} columns={COLUMNS}>
            <span className="truncate text-sm font-semibold">{supplier.name}</span>
            <span className="text-fg-muted text-sm">{t(supplier.category)}</span>
            <span className="text-fg-muted text-sm">{t(supplier.lead)}</span>

            <span
              data-num
              className={`text-right text-sm font-semibold ${TONE_TEXT[onTimeTone(supplier.onTime)]}`}
            >
              {supplier.onTime}%
            </span>

            <span data-num className="text-fg-muted text-sm">
              {supplier.openPurchases === 0 ? '—' : `${supplier.openPurchases} ${common('open')}`}
            </span>

            <span data-num className="text-fg-muted text-sm whitespace-nowrap">
              {supplier.contact}
            </span>

            {/* Millions to one decimal — the design's shorthand for a spend
                column, so six figures stay a column rather than a wall. */}
            <span data-num className="text-right text-sm font-semibold">
              {(supplier.spend / 100_000_000).toFixed(1)}M
            </span>
          </Row>
        ))}
      </TableCard>
    </>
  );
}
