'use client';

import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useState } from 'react';
import { formatTiyinAmount } from '@restaurant/utils';

import type { Locale } from '@/i18n';

import { pagesCopy } from '../pages-copy';
import { PAGE_COMPARISON, PAGE_PLANS } from '../pages-data';
import { Check, EYEBROW, H2, LEDE, PageHead } from '../page-ui';

/**
 * Pricing — `Sayt v2.dc.html:466-594`.
 *
 * Three things the home page's summary did not have and the design does: the
 * monthly/yearly toggle with its own arithmetic, the twelve-row comparison
 * table, and the ROI calculator.
 *
 * The calculator is the one worth arguing for. Every restaurant system's
 * pricing page states a number and hopes; this one takes three figures the
 * owner already knows and shows the working, line by line, including the line
 * that subtracts what we charge — and it says plainly, in its own copy, that
 * the percentages are an average and not a promise. A calculator that could
 * only ever produce a happy answer is an advertisement wearing a spreadsheet;
 * this one returns "it does not pay for itself yet, call us" below a certain
 * size, because at one small branch it genuinely does not.
 */

/** The design's own coefficients — `dc.html:1352-1361`. */
const SHRINK_RATE = 0.012;
const FOOD_RATE = 0.018;
const ADMIN_HOURS_PER_BRANCH = 14;
const ADMIN_HOUR_TIYIN = 45_000_00;
const EXTRA_BRANCH_TIYIN = 60_000_00;

/** Ten months paid, twelve used — the design's "two months free". */
const YEARLY_MONTHS = 10;

export function PricingBoard() {
  const locale = useLocale() as Locale;
  const t = pagesCopy(locale);

  /*
   * The design's own opening figures — `dc.html:947`:
   * `roiBr: 3, roiRev: 180, roiStaff: 14`.
   *
   * They are not decoration. The calculator has a floor below which it
   * honestly answers "this does not pay for itself yet", and the numbers a
   * reader lands on decide whether the first thing they see is an argument or
   * a refusal. 120 mln and 18 staff were invented here; 180 and 14 are the
   * design's, and they describe the restaurant this is sold to.
   */
  const [yearly, setYearly] = useState(false);
  const [branches, setBranches] = useState(3);
  const [revenue, setRevenue] = useState(180);
  const [staff, setStaff] = useState(14);

  const money = (tiyin: number) => formatTiyinAmount(tiyin, locale);

  /*
   * The maths, in tiyin like every other amount in this system.
   *
   * `revenue` is millions of so'm per branch per month, which is how the
   * design's stepper reads — so one unit is 1 000 000 so'm, which is
   * 100 000 000 tiyin. Doing that conversion here rather than in the input is
   * what keeps the rest of the arithmetic in the same unit as the plan prices.
   */
  const monthlyRevenue = revenue * 100_000_000 * branches;
  const shrink = Math.round(monthlyRevenue * SHRINK_RATE);
  const food = Math.round(monthlyRevenue * FOOD_RATE);
  const adminHours = branches * ADMIN_HOURS_PER_BRANCH;
  const admin = adminHours * ADMIN_HOUR_TIYIN;

  const planCost =
    branches <= 1
      ? (PAGE_PLANS[0]?.monthlyTiyin ?? 0)
      : branches <= 5
        ? (PAGE_PLANS[1]?.monthlyTiyin ?? 0)
        : (PAGE_PLANS[1]?.monthlyTiyin ?? 0) + (branches - 5) * EXTRA_BRANCH_TIYIN;

  const gross = shrink + food + admin;
  const net = gross - planCost;
  const paybackDays = net > 0 ? Math.max(1, Math.round(planCost / (gross / 30))) : null;

  const rows = [shrink, food, admin, -planCost];

  /* Which plan that cost is, in the design's own three cases — `dc.html:1383`.
     `roiRows[3].basis` in the catalogue says "Start" and stayed "Start" at
     twenty branches, where the figure being subtracted is Growth plus fifteen
     extra branches. */
  const planBasis = branches <= 1 ? 'Start' : branches <= 5 ? 'Growth' : t.roiPlanExtra;

  return (
    <>
      {/* ------------------------------------------------------------ plans */}
      <section data-pagetop className="pt-[76px]">
        <div data-wrap>
          <PageHead eyebrow={t.page.nPricing} title={t.page.priH} lede={t.page.priP} />

          <div className="mt-8 flex flex-wrap items-center gap-3.5">
            <div className="bg-bg-muted flex gap-[3px] rounded-[11px] p-[3px]">
              {[
                [false, t.page.billM],
                [true, t.page.billY],
              ].map(([value, label]) => (
                <button
                  key={String(value)}
                  type="button"
                  data-press
                  aria-pressed={yearly === value}
                  onClick={() => setYearly(value as boolean)}
                  className={`h-9 rounded-[8px] px-4 text-[14px] font-semibold ${
                    yearly === value ? 'bg-surface text-fg shadow-xs' : 'text-fg-muted'
                  }`}
                >
                  {label as string}
                </button>
              ))}
            </div>

            <span className="bg-success-50 text-success-700 rounded-full px-[11px] py-1.5 text-[13px] font-semibold">
              {t.page.billSave}
            </span>
          </div>

          <div data-price className="mt-7 grid grid-cols-3 items-start gap-4">
            {PAGE_PLANS.map((plan, index) => {
              const words = t.plans[index];

              return (
                <div
                  key={plan.id}
                  className={`bg-surface rounded-[16px] border p-7 ${
                    plan.featured ? 'border-brand-500 shadow-lg' : 'border-border'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-display text-[19px] font-bold tracking-tight capitalize">
                      {plan.id}
                    </span>
                    {plan.featured ? (
                      <span className="bg-brand-50 text-brand-600 inline-flex h-[21px] items-center rounded-full px-2 text-[11px] font-semibold">
                        {t.page.prPop}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3.5 flex items-baseline gap-1.5">
                    {/* A price must never wrap mid-figure. */}
                    <span className="font-display text-[34px] font-bold tracking-[-.024em] whitespace-nowrap">
                      {plan.monthlyTiyin === null
                        ? t.planCustom
                        : money(
                            yearly
                              ? Math.round((plan.monthlyTiyin * YEARLY_MONTHS) / 12)
                              : plan.monthlyTiyin,
                          )}
                    </span>
                    {plan.monthlyTiyin === null ? null : (
                      <span className="text-fg-subtle text-[13px] whitespace-nowrap">
                        {t.planPer}
                      </span>
                    )}
                  </div>

                  <div className="text-fg-subtle mt-1.5 text-[13px]">{words?.sub}</div>

                  {/* What the year actually costs, spelled out. A card that
                      shows a monthly figure under a "yearly" toggle and never
                      states the sum being committed to is the oldest trick on a
                      pricing page. */}
                  {yearly && plan.monthlyTiyin !== null ? (
                    <div className="text-success-700 mt-[7px] text-xs font-semibold">
                      {t.planYearBefore}
                      {money(plan.monthlyTiyin * YEARLY_MONTHS)}
                      {t.planYearAfter}
                    </div>
                  ) : null}

                  <div className="bg-divider my-5 h-px" />

                  <div className="grid gap-2.5">
                    {(words?.items ?? []).map((item) => (
                      <div key={item} className="flex items-start gap-2.5">
                        <Check size={12} />
                        <span className="text-fg-muted text-[14px] leading-[1.5]">{item}</span>
                      </div>
                    ))}
                  </div>

                  <Link
                    data-press
                    href="/contact"
                    className={`mt-6 grid h-11 w-full place-items-center rounded-[11px] border text-[14px] font-semibold ${
                      plan.featured
                        ? 'border-brand-500 bg-brand-500 text-white'
                        : 'border-border-strong bg-surface text-fg'
                    }`}
                  >
                    {t.page.prCta}
                  </Link>
                </div>
              );
            })}
          </div>

          <p className="text-fg-subtle mt-5 max-w-[760px] text-[13px] leading-[1.6]">
            {t.page.prNote}
          </p>
        </div>
      </section>

      {/* -------------------------------------------------------------- roi */}
      <section data-sec className="bg-bg-subtle mt-[72px] border-t border-b">
        <div data-wrap>
          <div className={EYEBROW}>{t.page.roiEyebrow}</div>
          <h2 data-h2 className={H2}>
            {t.page.roiH}
          </h2>
          <p data-lede className={LEDE}>
            {t.page.roiP}
          </p>

          <div data-roi className="mt-10 grid grid-cols-[1fr_1.1fr] items-start gap-8">
            <div className="border-border bg-surface min-w-0 rounded-[16px] border p-[18px] sm:p-[26px]">
              <div className="grid gap-6">
                <Stepper
                  label={t.roiInputs[0]?.label ?? ''}
                  hint={t.roiInputs[0]?.hint ?? ''}
                  value={String(branches)}
                  percent={(branches / 20) * 100}
                  onStep={(step) => setBranches((n) => Math.min(20, Math.max(1, n + step)))}
                />
                <Stepper
                  label={t.roiInputs[1]?.label ?? ''}
                  hint={t.roiInputs[1]?.hint ?? ''}
                  value={`${revenue} ${t.roiMillions}`}
                  percent={(revenue / 600) * 100}
                  onStep={(step) => setRevenue((n) => Math.min(600, Math.max(20, n + step * 20)))}
                />
                <Stepper
                  label={t.roiInputs[2]?.label ?? ''}
                  hint={t.roiInputs[2]?.hint ?? ''}
                  value={String(staff)}
                  percent={(staff / 60) * 100}
                  onStep={(step) => setStaff((n) => Math.min(60, Math.max(3, n + step)))}
                />
              </div>
            </div>

            {/*
             * The answer first, then the working — `dc.html:521-548`.
             *
             * This panel used to open with four line items and put the total
             * underneath them, which is a spreadsheet. The design leads with
             * the number and the payback sentence, and the four rows below are
             * there for the reader who wants to argue with one of them.
             */}
            <div className="min-w-0 rounded-[16px] bg-[var(--n-900)] p-[18px] text-white sm:p-[26px]">
              <div className="tracking-caps text-xs font-semibold text-white/45 uppercase">
                {t.page.roiResult}
              </div>

              {/* The figure and its unit share a line until the line is too
                  short for both. At 320 a nine-digit sum at 42px is wider than
                  the card it sits in, so the unit drops beneath it rather than
                  hanging off the edge. */}
              <div className="mt-3 flex flex-wrap items-baseline gap-x-[9px] gap-y-1">
                <span
                  data-num
                  className="font-display text-[34px] leading-none font-bold tracking-[-.026em] sm:text-[42px]"
                >
                  {net >= 0 ? '+' : '−'}
                  {money(Math.abs(net))}
                </span>
                <span className="text-[14px] text-white/60">{t.page.roiPerMonth}</span>
              </div>

              <p className="mt-2 text-[13px] leading-[1.55] text-white/60">
                {paybackDays === null
                  ? t.roiNoPayback
                  : `${t.roiPaybackBefore}${paybackDays}${t.roiPaybackAfter}`}
              </p>

              <div className="mt-[22px] grid gap-px overflow-hidden rounded-[12px] bg-white/10">
                {t.roiRows.map((row, index) => (
                  <div key={row.label} className="bg-white/[.04] px-4 py-3.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[14px] font-medium text-white/[.86]">{row.label}</span>
                      <span
                        data-num
                        className={`font-display flex-none text-[16px] font-bold whitespace-nowrap ${
                          (rows[index] ?? 0) < 0 ? 'text-white' : 'text-success-500'
                        }`}
                      >
                        {(rows[index] ?? 0) < 0 ? '−' : '+'}
                        {money(Math.abs(rows[index] ?? 0))}
                      </span>
                    </div>
                    <div className="mt-1 text-xs leading-[1.5] text-white/45">
                      {/*
                       * The reporting line states its own basis, and the hours
                       * in it move with the branch count — `dc.html:1381` is
                       * `adminHours + " soat / oy ..."`. It was hard-coded to
                       * "0 soat / oy" in the catalogue, so a reader at twenty
                       * branches saw a saving of 12.6 mln so'm justified by
                       * zero hours of work. The plan row names the plan being
                       * charged for the same reason.
                       */}
                      {index === 2 ? `${adminHours}${row.basis}` : null}
                      {index === 3 ? planBasis : null}
                      {index !== 2 && index !== 3 ? row.basis : null}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-[18px] flex items-start gap-[11px] rounded-[12px] border border-white/[.12] p-3.5">
                <span
                  aria-hidden
                  className="bg-warning-500 mt-1.5 size-[7px] flex-none rounded-full"
                />
                <span className="text-xs leading-[1.55] text-white/60">{t.page.roiDisclaimer}</span>
              </div>

              <Link
                data-press
                href="/contact"
                className="bg-brand-500 mt-4 grid h-[46px] w-full place-items-center rounded-[11px] text-[15px] font-semibold text-white"
              >
                {t.page.roiCta}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- comparison */}
      <section data-sec>
        <div data-wrap>
          <div className={EYEBROW}>{t.page.cmpEyebrow}</div>
          <h2 data-h2 className={H2}>
            {t.page.cmpH}
          </h2>

          {/* The table scrolls inside its own box on a narrow screen rather
              than pushing the page sideways. */}
          <div
            data-cmp
            className="border-border bg-surface relative mt-9 overflow-x-auto rounded-lg border"
          >
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-divider border-b">
                  <th className="text-fg-subtle px-6 py-4 text-xs font-semibold tracking-wide uppercase">
                    {t.page.cmpFeature}
                  </th>
                  {PAGE_PLANS.map((plan) => (
                    <th
                      key={plan.id}
                      className="font-display px-4 py-4 text-center text-[15px] font-bold capitalize"
                    >
                      {plan.id}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.capabilities.map((capability, index) => (
                  <tr key={capability} className="border-divider border-b last:border-0">
                    <td className="px-6 py-3.5 text-[14px]">{capability}</td>
                    {(PAGE_COMPARISON[index] ?? [false, false, false]).map((on, column) => (
                      <td key={column} className="px-4 py-3.5 text-center">
                        {/* A tick or a dash, never colour alone: on a plan
                            table the difference between two rows is the whole
                            purchase decision. */}
                        {on ? (
                          <span className="inline-flex">
                            <Check size={12} />
                          </span>
                        ) : (
                          <span aria-hidden className="text-fg-disabled">
                            —
                          </span>
                        )}
                        <span className="sr-only">{on ? '✓' : '—'}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}

/** One ROI input: a label, the value, a bar, and two buttons. */
function Stepper({
  label,
  hint,
  value,
  percent,
  onStep,
}: {
  label: string;
  hint: string;
  value: string;
  percent: number;
  onStep: (step: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-[14px] font-semibold">{label}</span>
        <span data-num className="font-display text-brand-600 text-[19px] font-bold tracking-tight">
          {value}
        </span>
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <button
          type="button"
          data-press
          onClick={() => onStep(-1)}
          aria-label="−"
          className="border-border-strong bg-surface grid size-[38px] flex-none place-items-center rounded-[10px] border text-lg font-semibold"
        >
          −
        </button>

        <div data-rail className="bg-bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
          <div
            className="bg-brand-500 h-full rounded-full transition-[width] duration-150"
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>

        <button
          type="button"
          data-press
          onClick={() => onStep(1)}
          aria-label="+"
          className="border-border-strong bg-surface grid size-[38px] flex-none place-items-center rounded-[10px] border text-lg font-semibold"
        >
          +
        </button>
      </div>

      <p className="text-fg-subtle mt-2 text-xs leading-[1.5]">{hint}</p>
    </div>
  );
}
