'use client';

import { useLocale } from 'next-intl';

import type { Locale } from '@/i18n';

import { pagesCopy } from '../pages-copy';
import { PAGE_CASES } from '../pages-data';
import { PageHead, TONE_TEXT } from '../page-ui';

/**
 * Customers — `Sayt v2.dc.html:596-662`.
 *
 * Three case studies, each in the design's shape: who, what was wrong, what
 * changed, a quote from the person who lived it, and a panel of measured
 * results with the period they were measured over. The site had three
 * one-sentence pull-quotes standing in for this.
 *
 * The measurement period is not decoration. "Food cost down 2.1 points" means
 * nothing without "over three months, against the same season last year", and
 * every metric here carries its own note for that reason.
 */
export function CustomersBoard() {
  const locale = useLocale() as Locale;
  const t = pagesCopy(locale);

  return (
    <section data-pagetop className="pt-[76px] pb-[96px]">
      <div data-wrap>
        <PageHead eyebrow={t.page.nCustomers} title={t.page.cusH} lede={t.page.cusP} />

        <div className="mt-11 grid gap-5">
          {PAGE_CASES.map((study, index) => {
            const words = t.cases[index];

            if (words === undefined) return null;

            return (
              <article
                key={study.id}
                className="border-border bg-surface overflow-hidden rounded-[16px] border"
              >
                <div data-two className="grid grid-cols-[1.15fr_1fr]">
                  <div className="px-8 py-[30px]">
                    <div className="flex items-center gap-3">
                      <span className="bg-bg-muted font-display text-fg-muted grid size-10 flex-none place-items-center rounded-[10px] text-[13px] font-bold">
                        {study.id}
                      </span>
                      <div>
                        <div className="text-[17px] font-bold tracking-[-.014em]">
                          {words.title}
                        </div>
                        <div className="text-fg-subtle mt-0.5 text-[13px]">{words.meta}</div>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-4">
                      <div>
                        <div className="text-danger-600 text-xs font-semibold tracking-wide uppercase">
                          {t.page.cusBefore}
                        </div>
                        <p className="mt-2 text-[15px] leading-[1.6] text-pretty">{words.before}</p>
                      </div>

                      <div>
                        <div className="text-success-700 text-xs font-semibold tracking-wide uppercase">
                          {t.page.cusAfter}
                        </div>
                        <p className="text-fg-muted mt-2 text-[15px] leading-[1.6] text-pretty">
                          {words.after}
                        </p>
                      </div>
                    </div>

                    <blockquote className="border-brand-500 bg-bg-subtle mt-6 rounded-r-xl border-l-[3px] px-5 py-4.5">
                      <p className="text-[15px] leading-[1.65] text-pretty">{words.quote}</p>
                      <footer className="text-fg-subtle mt-3 text-[13px]">{words.who}</footer>
                    </blockquote>
                  </div>

                  <div className="bg-bg-subtle border-l px-8 py-[30px]">
                    <div className="text-fg-subtle text-xs font-semibold tracking-wide uppercase">
                      {t.page.cusResult}
                    </div>

                    <div className="bg-border border-border mt-3.5 grid gap-px overflow-hidden rounded-[12px] border">
                      {study.metrics.map((metric, position) => {
                        const line = words.metrics[position];

                        return (
                          <div key={metric.value} className="bg-surface px-4.5 py-4">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="text-fg-muted text-[13px]">{line?.label}</span>
                              <span
                                data-num
                                className={`font-display flex-none text-[19px] font-bold tracking-tight whitespace-nowrap ${TONE_TEXT[metric.tone]}`}
                              >
                                {metric.value}
                              </span>
                            </div>
                            <div className="text-fg-subtle mt-0.5 text-xs">{line?.note}</div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="text-fg-subtle mt-3.5 text-xs leading-[1.55]">
                      {words.period}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/*
         * Where the platform can be used, hairlined the way the design hairlines
         * its three-panel bands.
         *
         * Each cell carried a restaurant count — 26, 7, 4, 3, 2 — under a
         * heading that called them customers, and none of the five was true.
         * The cities are the true half: local payment rails, local fiscal law
         * and three languages are what make a city workable, and that is a fact
         * about the product rather than a claim about its sales.
         */}
        <p className="text-fg-subtle mt-8 text-sm">{t.cusCities}</p>

        <div className="bg-border border-border mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(min(160px,100%),1fr))] gap-px overflow-hidden rounded-[14px] border">
          {t.cities.map((city) => (
            <div key={city} className="bg-surface px-[18px] py-5">
              <div className="font-display text-[17px] font-bold tracking-tight">{city}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
