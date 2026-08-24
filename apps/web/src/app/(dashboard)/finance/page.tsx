import type { ReactNode } from 'react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { KpiBadge } from '@restaurant/ui';
import { formatTiyinAmount } from '@restaurant/utils';

import { moduleMetadata } from '../module-page';
import { ACTION, PageHead, Rail } from '../screen';
import { deltaTone } from './finance-data';
import { financeScreen } from './finance-server';
import { askedMonth } from './month-nav';
import { MonthPicker } from './month-picker';

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
/**
 * The two glyphs the design puts on this strip, traced from
 * `Smart Restaurant OS.dc.html:3104-3105` — 15px, stroke 1.85, rounded caps and
 * joins. Only the first two cards carry one: revenue and expenses are the pair
 * a reader looks for, and badging all four would badge none of them.
 */
const REVENUE_ICON = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.85"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5v10A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
    <path d="M16.5 12.5h2" />
  </svg>
);

const EXPENSE_ICON = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.85"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
    <path d="M12 8v8M8.5 12.5 12 16l3.5-3.5" />
  </svg>
);

const CARD = 'bg-surface rounded-lg border';
const PL_COLUMNS = '[grid-template-columns:minmax(0,1fr)_150px_90px_90px]';
const H3 = 'text-md font-semibold tracking-snug';

/** One figure on the strip. The glyph and its tint travel together or not at all. */
type Kpi = {
  label: string;
  value: string;
  note: string;
  tone?: string;
  icon?: ReactNode;
  iconTone?: 'brand' | 'warning';
};

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  /*
   * Which month, from the URL.
   *
   * The default is the month that FINISHED rather than the one that is running:
   * a P&L is read about a closed month, and defaulting to the current one
   * answers a half-empty sheet to a reader who asked no question.
   * `financeScreen()` defaults the same way, so this is the picker's starting
   * point rather than a second rule.
   */
  const now = new Date();
  const latest = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7);

  const [params, nav, t, locale] = await Promise.all([
    searchParams,
    getTranslations('console.nav'),
    getTranslations('console.finance'),
    getLocale(),
  ]);

  const month = askedMonth(params.month, previous, latest);

  /*
   * The month, from `GET /analytics/profit-loss?month=` and four reads beside
   * it.
   *
   * Falls back to the fixture when there is no session or the API is down —
   * see `finance-server.ts`, which is also where the seven ledger lines are
   * mapped out of the statement's own shape.
   */
  const screen = await financeScreen(month, locale as 'uz' | 'ru' | 'en');

  const { ledger: LEDGER, period: PERIOD, paymentMix: PAYMENT_MIX, cashflow: CASHFLOW } = screen;

  const peakFlow =
    CASHFLOW === null ? 0 : Math.max(...CASHFLOW.flatMap((month) => [month.in, month.out]));

  /*
   * The header states the month it drew and whether the ledger has closed it.
   *
   * `t('subtitle')` asserts "1–31 July · all branches · closed and verified on
   * 3 August" — an accounting claim, from the catalogue, about a restaurant
   * that has closed nothing. It survives only where the figures under it are
   * the design's too.
   */
  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${screen.month}-01T00:00:00Z`));

  const subtitle = screen.live
    ? t('subtitleLive', {
        month: monthLabel,
        status: screen.monthClosed === true ? t('statusClosed') : t('statusOpen'),
      })
    : t('subtitle');

  /*
   * A caption is a ratio of two figures on the same response, or it is nothing.
   *
   * Eight of them were catalogue sentences printed under live values — "68.9%
   * of revenue" beside a real expense total, a VAT return "filed on 5 August",
   * an unreconciled till at a branch this tenant does not own. Where the
   * denominator is zero there is no ratio to state, so the line is empty rather
   * than `0%`.
   */
  const share = (amount: number): string | null =>
    screen.live
      ? PERIOD.revenueTiyin === 0
        ? null
        : t('ofRevenue', { percent: ((amount / PERIOD.revenueTiyin) * 100).toFixed(1) })
      : null;

  const note = (live: string | null, catalogue: string): string =>
    screen.live ? (live ?? '') : catalogue;

  const money = (tiyin: number | null): string => (tiyin === null ? '—' : formatTiyinAmount(tiyin));

  return (
    <>
      <PageHead title={nav('finance')} subtitle={subtitle}>
        {/*
         * The period picker, and it moves the whole page.
         *
         * It used to flash "the period picker is on its way" and change
         * nothing, because the month was `financeScreen()`'s own argument and
         * no route carried one. It is `?month=` now, so the statement, the
         * payment mix and the four cards under them are all about the month the
         * heading names.
         */}
        <MonthPicker
          month={screen.month}
          label={monthLabel}
          latest={latest}
          prevLabel={t('monthPrev')}
          nextLabel={t('monthNext')}
        />

        {/* The export is a real page: `/documents` draws this month's statement
            on A4 and the browser prints or saves it. */}
        <Link
          href={`/documents?d=profit-loss&month=${screen.month}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${ACTION} grid place-items-center`}
        >
          {t('exportLedger')}
        </Link>
      </PageHead>

      <div className="bg-surface mb-5 grid [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))] overflow-hidden rounded-lg border">
        {[
          {
            label: t('kRevenue'),
            value: formatTiyinAmount(PERIOD.revenueTiyin),
            note: note(screen.live ? PERIOD.netDelta : null, t('kRevenueNote')),
            icon: REVENUE_ICON,
            iconTone: 'brand' as const,
          },
          {
            label: t('kExpenses'),
            value: formatTiyinAmount(PERIOD.expensesTiyin),
            note: note(share(PERIOD.expensesTiyin), t('kExpensesNote')),
            icon: EXPENSE_ICON,
            iconTone: 'warning' as const,
          },
          {
            label: t('kNetProfit'),
            value: formatTiyinAmount(PERIOD.netProfitTiyin),
            note: note(
              screen.live ? t('marginNote', { percent: PERIOD.netMargin.replace('%', '') }) : null,
              t('kNetProfitNote'),
            ),
            tone: 'text-success-700',
          },
          {
            label: t('kCash'),
            value: money(PERIOD.cashOnHandTiyin),
            // Which drawers and which accounts is not on any response here.
            note: note(null, t('kCashNote')),
          },
        ].map((kpi: Kpi) => (
          <div key={kpi.label} className="border-divider px-[22px] py-5 not-last:border-r">
            {/* A badged card takes the design's 10px uppercase label; a plain
                one keeps the 12px sentence case. The two live side by side on
                this strip in the file, so they live side by side here. */}
            {kpi.icon === undefined ? (
              <div className="text-fg-subtle mb-2.5 text-xs">{kpi.label}</div>
            ) : (
              <div className="mb-3 flex items-start justify-between gap-2.5">
                <span className="text-fg-subtle text-3xs tracking-caps pt-[3px] leading-[1.4] font-semibold uppercase">
                  {kpi.label}
                </span>
                <KpiBadge tone={kpi.iconTone}>{kpi.icon}</KpiBadge>
              </div>
            )}
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
          {/* Hidden rather than filled: a tender split nobody paid into is a
              panel with nothing to say, and the fixture's four slices on a live
              screen are another restaurant's takings. */}
          <section className={`${CARD} px-6 py-[22px]`} hidden={PAYMENT_MIX === null}>
            <h3 className={`${H3} mb-[18px]`}>{t('payMixTitle')}</h3>

            {(PAYMENT_MIX ?? []).map((slice) => (
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

          <section className={`${CARD} px-6 py-[22px]`} hidden={CASHFLOW === null}>
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
              {(CASHFLOW ?? []).map((month) => (
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
                  <span className="text-fg-subtle text-xs">{month.label}</span>
                </div>
              ))}
            </div>

            {/*
             * The one thing a reader of a venue's page has to know about these
             * bars: `finance.expenses` carries no branch, so the money going
             * out is the whole business's even when the money coming in is not.
             * Printed only when that is actually the case.
             */}
            {screen.cashflowScoped ? (
              <p className="text-fg-subtle mt-3 text-xs leading-normal">{t('cashflowScope')}</p>
            ) : null}
          </section>
        </div>
      </div>

      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-5">
        {[
          {
            label: t('kRefunds'),
            value: money(PERIOD.refundsTiyin),
            /*
             * Two facts or none. The catalogue's line asserts "0.8% of revenue
             * · 31 cases" and was printed over a live figure; the live caption
             * states the count the total was made of, and drops the share when
             * there is no revenue to divide by.
             */
            note: note(
              screen.refundCount === null ? null : t('kRefundsNoteLive', { n: screen.refundCount }),
              t('kRefundsNote'),
            ),
          },
          {
            label: t('kDiscounts'),
            value: formatTiyinAmount(PERIOD.discountsTiyin),
            note: note(share(PERIOD.discountsTiyin), t('kDiscountsNote')),
          },
          {
            label: t('kVat'),
            value: formatTiyinAmount(PERIOD.vatTiyin),
            // When it was filed is not something this platform records.
            note: note(null, t('kVatNote')),
          },
          {
            label: t('kUnreconciled'),
            value: PERIOD.unreconciled === null ? '—' : String(PERIOD.unreconciled),
            /*
             * "2" means nothing without "out of 61". The catalogue's line named
             * a branch and a date — a till at Sergeli on 29 July — over a count
             * from a different restaurant's month.
             */
            note: note(
              screen.shiftsClosed === null
                ? null
                : t('kUnreconciledNoteLive', { n: screen.shiftsClosed }),
              t('kUnreconciledNote'),
            ),
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
