'use client';

import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useState } from 'react';

import type { Locale } from '@/i18n';

import { pagesCopy } from '../pages-copy';
import { PAGE_FAQ_CATEGORY } from '../pages-data';
import { EYEBROW } from '../page-ui';

/**
 * The questions — `Sayt v2.dc.html:661-703`.
 *
 * Ten of them in four categories, where the site had six in a flat list. The
 * filter earns its place at ten: a reader on this page has one question,
 * usually about money or about how long it takes, and scrolling past six they
 * did not ask to find the seventh is the reason FAQ pages get a bad name.
 *
 * ---------------------------------------------------------------------------
 * A rail, not a row of chips
 *
 * This was built as a row of pills above the list with an extra "all" pill
 * whose label came from `page.tAll` — which is "Barcha keyslar", the *case
 * studies* button from the home page. So the FAQ's own filter offered the
 * reader "All case studies", and pressing it did something else entirely.
 *
 * The design puts the four categories in the left column with a count beside
 * each, and has no "all" control: pressing the selected category clears it,
 * which is the same gesture and one fewer thing on the page. The count is what
 * makes the rail worth having — a reader can see there are two questions about
 * price before deciding to filter to them.
 *
 * `<details>` rather than React state for the answers, so every answer is in
 * the HTML a crawler reads — which is the whole point of an FAQ page, and what
 * the `FAQPage` JSON-LD this route emits describes. The *filter* is state, and
 * it only hides.
 */
export function FaqBoard() {
  const locale = useLocale() as Locale;
  const t = pagesCopy(locale);
  const [category, setCategory] = useState<number | null>(null);

  const shown = t.faq
    .map((entry, index) => ({ entry, index }))
    .filter(({ index }) => category === null || PAGE_FAQ_CATEGORY[index] === category);

  return (
    <section data-pagetop className="pt-[76px] pb-[96px]">
      <div data-wrap>
        <div data-two className="grid grid-cols-[340px_1fr] items-start gap-14">
          <div>
            <div className={EYEBROW}>{t.page.nFaq}</div>
            <h1
              data-h1
              className="font-display mt-5 text-[38px] leading-[1.06] font-bold tracking-[-.028em] text-balance"
            >
              {t.page.faqH}
            </h1>
            <p className="text-fg-muted mt-4 text-[16px] leading-[1.6] text-pretty">
              {t.page.faqP}
            </p>

            <Link
              data-btn-quiet
              data-press
              href="/contact"
              className="border-border-strong bg-surface text-fg mt-5 inline-flex h-11 items-center rounded-[11px] border px-[18px] text-[14px] font-semibold"
            >
              {t.page.faqLink}
            </Link>

            <div className="mt-8 grid gap-0.5 border-t pt-6">
              {t.faqCategories.map((label, index) => {
                const on = category === index;
                const count = PAGE_FAQ_CATEGORY.filter((value) => value === index).length;

                return (
                  <button
                    key={label}
                    type="button"
                    data-press
                    aria-pressed={on}
                    /* Pressing the chosen one clears it — the design has no
                       separate "all" control and does not need one. */
                    onClick={() => setCategory(on ? null : index)}
                    className={`flex h-10 cursor-pointer items-center justify-between gap-3 rounded-[9px] border-0 px-3 text-left text-[14px] ${
                      on ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-fg-muted font-medium'
                    }`}
                  >
                    {label}
                    <span data-num className="text-fg-subtle font-mono text-xs">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t">
            {shown.length === 0 ? (
              <p className="text-fg-subtle px-1 py-10 text-[15px]">{t.page.faqNone}</p>
            ) : (
              shown.map(({ entry, index }) => (
                <details
                  /* The category is in the key so a filter change remounts the
                     list: without it React keeps the open row's DOM node and
                     the answer of a hidden question stays expanded under a
                     different question's heading. */
                  key={`${String(category)}-${entry.q}`}
                  name="faq"
                  open={index === shown[0]?.index}
                  className="group border-b"
                >
                  <summary className="text-fg flex cursor-pointer list-none items-start justify-between gap-5 px-1 py-5 [&::-webkit-details-marker]:hidden">
                    <span className="text-[16px] leading-[1.4] font-semibold tracking-[-.01em]">
                      {entry.q}
                    </span>
                    <span
                      aria-hidden
                      className="text-fg-subtle mt-px grid size-[22px] flex-none place-items-center text-[19px] leading-none font-normal"
                    >
                      <span className="group-open:hidden">+</span>
                      <span className="hidden group-open:block">−</span>
                    </span>
                  </summary>

                  <p className="text-fg-muted m-0 pr-10 pb-[22px] pl-1 text-[15px] leading-[1.65] text-pretty">
                    {entry.a}
                  </p>
                </details>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
