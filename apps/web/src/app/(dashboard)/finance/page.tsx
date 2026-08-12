import { getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { moduleMetadata } from '../module-page';
import { ACTION, PageHead, Rail } from '../screen';
import { CASHFLOW, deltaTone, LEDGER, PAYMENT_MIX, PERIOD } from './finance-data';

export const generateMetadata = () => moduleMetadata('finance');

/**
 * The month, closed.
 *
 * Built to the design's Finance screen: four figures, the P&L on the left with
 * the payment mix and cash flow beside it, and four smaller cards underneath
 * for the things an accountant checks before signing the period off.
 *
 * Outflows are shown in brackets rather than with a minus sign, which is the
 * accounting convention and what the sub-line says. The delta column is
 * coloured by meaning: marketing down 14% is green, revenue down 14% is not.
 *
 * TODO — Phase 1 · finance, once the module is built:
 *   - The period picker and the close/reopen flow
 *   - Expense entry and supplier payables
 *   - Payroll, and the period lock that follows it
 *   - VAT and e-invoicing, which Compliance on the public site promises
 */
const CARD = 'bg-surface rounded-lg border';
const PL_COLUMNS = '[grid-template-columns:minmax(0,1fr)_150px_90px_90px]';
const H3 = 'text-md font-semibold tracking-snug';

export default async function FinancePage() {
  const [nav, t] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.finance'),
  ]);

  const peakFlow = Math.max(...CASHFLOW.flatMap((month) => [month.in, month.out]));

  return (
    <>
      <PageHead title={nav('finance')} subtitle={t('subtitle')}>
        <button type="button" className={ACTION}>
          {t('period')}
        </button>
        <button type="button" className={ACTION}>
          {t('exportLedger')}
        </button>
      </PageHead>

      <div className="bg-surface mb-5 grid [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] overflow-hidden rounded-lg border">
        {[
          {
            label: t('kRevenue'),
            value: formatTiyinAmount(PERIOD.revenueTiyin),
            note: t('kRevenueNote'),
          },
          {
            label: t('kExpenses'),
            value: formatTiyinAmount(PERIOD.expensesTiyin),
            note: t('kExpensesNote'),
          },
          {
            label: t('kNetProfit'),
            value: formatTiyinAmount(PERIOD.netProfitTiyin),
            note: t('kNetProfitNote'),
            tone: 'text-success-700',
          },
          {
            label: t('kCash'),
            value: formatTiyinAmount(PERIOD.cashOnHandTiyin),
            note: t('kCashNote'),
          },
        ].map((kpi) => (
          <div key={kpi.label} className="border-divider px-[22px] py-5 not-last:border-r">
            <div className="text-fg-subtle mb-2.5 text-xs">{kpi.label}</div>
            <div
              data-num
              className={`font-display text-3xl leading-none font-semibold tracking-tight ${kpi.tone ?? ''}`}
            >
              {kpi.value}
            </div>
            <div className="text-fg-subtle mt-2 text-xs">{kpi.note}</div>
          </div>
        ))}
      </div>

      <div
        data-split
        className="mb-5 grid [grid-template-columns:minmax(0,1.5fr)_minmax(0,1fr)] gap-5"
      >
        <section className={`${CARD} overflow-hidden`}>
          <div className="border-divider border-b px-6 pt-5 pb-4">
            <h3 className={H3}>{t('plTitle')}</h3>
            <p className="text-fg-subtle mt-1 text-xs">{t('plSub')}</p>
          </div>

          <div
            className={`bg-bg-subtle text-fg-subtle grid ${PL_COLUMNS} gap-4 border-b px-6 py-2.5 text-xs font-semibold tracking-wide`}
          >
            <span>{t('colLine')}</span>
            <span className="text-right">{t('colAmount')}</span>
            <span className="text-right">{t('colOfRevenue')}</span>
            <span className="text-right">{t('colVsPrevious')}</span>
          </div>

          {LEDGER.map((line) => {
            const outflow = line.amount < 0;

            return (
              <div
                key={line.key}
                data-row
                className={`border-divider grid ${PL_COLUMNS} items-center gap-4 border-b px-6 py-3`}
              >
                <span className="text-sm">{t(line.key)}</span>

                {/* Brackets, not a minus — the convention the sub-line states. */}
                <span
                  data-num
                  className={`text-right text-sm font-semibold ${outflow ? 'text-fg-muted' : ''}`}
                >
                  {outflow
                    ? `(${formatTiyinAmount(-line.amount)})`
                    : formatTiyinAmount(line.amount)}
                </span>

                <span data-num className="text-fg-muted text-right text-sm">
                  {line.ofRevenue.toFixed(1)}%
                </span>

                <span data-num className={`text-right text-sm font-medium ${deltaTone(line)}`}>
                  {line.delta > 0 ? '+' : ''}
                  {line.delta.toFixed(1)}%
                </span>
              </div>
            );
          })}

          <div className={`bg-bg-subtle grid ${PL_COLUMNS} gap-4 px-6 py-4`}>
            <span className="text-sm font-semibold">{t('kNetProfit')}</span>
            <span data-num className="font-display tracking-snug text-right text-lg font-semibold">
              {formatTiyinAmount(PERIOD.netProfitTiyin)}
            </span>
            <span data-num className="text-right text-sm font-semibold">
              {PERIOD.netMargin}
            </span>
            <span data-num className="text-success-700 text-right text-sm font-semibold">
              {PERIOD.netDelta}
            </span>
          </div>
        </section>

        <div className="flex flex-col gap-5">
          <section className={`${CARD} px-6 py-[22px]`}>
            <h3 className={`${H3} mb-[18px]`}>{t('payMixTitle')}</h3>

            {PAYMENT_MIX.map((slice) => (
              <div key={slice.key ?? slice.brand} className="py-[9px]">
                <div className="mb-[7px] flex justify-between">
                  <span className="text-sm">{slice.key ? t(slice.key) : slice.brand}</span>
                  <span data-num className="text-sm font-semibold">
                    {slice.percent}%
                  </span>
                </div>
                <Rail percent={slice.percent} colour="var(--brand-500)" />
                <div data-num className="text-fg-subtle mt-1.5 text-xs">
                  {formatTiyinAmount(slice.amount)}
                </div>
              </div>
            ))}
          </section>

          <section className={`${CARD} px-6 py-[22px]`}>
            <div className="mb-5 flex items-baseline justify-between gap-3">
              <h3 className={H3}>{t('cashflowTitle')}</h3>
              <span className="text-fg-muted flex gap-3.5 text-xs">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="bg-brand-500 size-[9px] rounded-[2px]" />
                  {t('flowIn')}
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="bg-border-strong size-[9px] rounded-[2px]" />
                  {t('flowOut')}
                </span>
              </span>
            </div>

            <div className="flex h-[180px] items-end gap-3.5">
              {CASHFLOW.map((month) => (
                <div key={month.month} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-[160px] w-full items-end justify-center gap-1">
                    <span
                      className="bg-brand-500 w-[44%] rounded-t-[3px]"
                      style={{ height: Math.round((month.in / peakFlow) * 150) }}
                    />
                    <span
                      className="bg-border-strong w-[44%] rounded-t-[3px]"
                      style={{ height: Math.round((month.out / peakFlow) * 150) }}
                    />
                  </div>
                  <span className="text-fg-subtle text-xs">{month.month}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))] gap-5">
        {[
          {
            label: t('kRefunds'),
            value: formatTiyinAmount(PERIOD.refundsTiyin),
            note: t('kRefundsNote'),
          },
          {
            label: t('kDiscounts'),
            value: formatTiyinAmount(PERIOD.discountsTiyin),
            note: t('kDiscountsNote'),
          },
          { label: t('kVat'), value: formatTiyinAmount(PERIOD.vatTiyin), note: t('kVatNote') },
          {
            label: t('kUnreconciled'),
            value: String(PERIOD.unreconciled),
            note: t('kUnreconciledNote'),
            tone: 'text-warning-700',
          },
        ].map((card) => (
          <div key={card.label} className={`${CARD} px-[22px] py-5`}>
            <div className="text-fg-subtle mb-[9px] text-xs">{card.label}</div>
            <div data-num className={`font-display text-xl font-semibold ${card.tone ?? ''}`}>
              {card.value}
            </div>
            <div className="text-fg-subtle mt-1.5 text-xs">{card.note}</div>
          </div>
        ))}
      </div>
    </>
  );
}
