'use client';

import { useLocale } from 'next-intl';
import { useState } from 'react';

import type { Locale } from '@/i18n';

import { pagesCopy } from '../pages-copy';
import { PAGE_INTEGRATIONS, PAGE_MODS } from '../pages-data';
import { CARD, EYEBROW, H2, LEDE, Check, PageHead, TONE_CHIP } from '../page-ui';

/**
 * The product page — `Sayt v2.dc.html:327-405`.
 *
 * Six module tabs, each with its own headline, four proof bullets, a stat line
 * and a still of the screen it describes. The home page has a six-card summary
 * of the same six modules and this is what those cards were summarising: it did
 * not exist, so "Mahsulot" in the header scrolled to the summary.
 *
 * The panel is one tab at a time rather than six stacked sections, which is the
 * design's own choice and the right one — a reader is deciding whether the
 * kitchen screen is any good, not reading six of them in order.
 */
export function ProductBoard() {
  const locale = useLocale() as Locale;
  const t = pagesCopy(locale);
  const [tab, setTab] = useState(0);

  const mod = t.mods[tab] ?? t.mods[0]!;
  const data = PAGE_MODS[tab] ?? PAGE_MODS[0]!;

  return (
    <>
      <section data-pagetop className="pt-[76px]">
        <div data-wrap>
          <PageHead eyebrow={t.page.nProduct} title={t.page.prodH} lede={t.page.prodP} />

          <div data-modtabs className="mt-10 flex flex-wrap gap-2 pb-1">
            {t.mods.map((entry, index) => (
              <button
                key={PAGE_MODS[index]?.id ?? index}
                type="button"
                data-press
                aria-pressed={index === tab}
                onClick={() => setTab(index)}
                /* Solid brand when picked, not a tint. `dc.html:1243` sets
                   the chosen tab's background to `--brand-500` and its text to
                   white; the tint version read as "hovered" beside five plain
                   pills and a reader could not tell which module was on
                   screen. */
                className={`rounded-pill h-10 flex-none border px-4 text-[14px] font-semibold whitespace-nowrap ${
                  index === tab
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-border-strong bg-surface text-fg-muted'
                }`}
              >
                {entry.tab}
              </button>
            ))}
          </div>

          {/* `key` on the tab index so React remounts the panel and the
              motion layer replays `panelIn` — without it the body swaps its
              text in place and the six tabs feel like one static page. */}
          <div
            key={tab}
            data-two
            data-panel-in
            className="mt-9 grid grid-cols-2 items-start gap-12 border-t pt-9"
          >
            <div>
              <span className="bg-brand-50 text-brand-600 inline-flex h-[26px] items-center rounded-full px-[11px] text-xs font-semibold">
                {mod.tag}
              </span>

              <h2 className="font-display mt-4 text-[30px] leading-[1.15] font-bold tracking-tight">
                {mod.head}
              </h2>

              <p className="text-fg-muted mt-3.5 text-[17px] leading-[1.6] text-pretty">
                {mod.body}
              </p>

              <div className="mt-7 grid gap-3.5">
                {mod.points.map((point) => (
                  <div key={point} className="flex items-start gap-3">
                    <Check />
                    <span className="text-[15px] leading-[1.55]">{point}</span>
                  </div>
                ))}
              </div>

              <div className="border-border bg-bg-subtle mt-7 flex items-baseline gap-2.5 rounded-[12px] border px-[18px] py-4">
                <span className="font-display text-brand-600 text-[22px] font-bold tracking-tight">
                  {data.stat}
                </span>
                <span className="text-fg-muted text-[14px] leading-[1.45]">{mod.statLabel}</span>
              </div>
            </div>

            {/*
             * A still of the screen, drawn rather than photographed.
             *
             * The design puts an image-slot here; the screens it would show are
             * in this repository, so the panel is built from the same tokens
             * they are. Five rows and a status chip is what a reader needs to
             * believe the claim on the left.
             */}
            <div className="border-border bg-surface overflow-hidden rounded-[16px] border shadow-lg">
              <div className="border-divider bg-bg-subtle flex h-9 items-center gap-2.5 border-b px-3.5">
                <span className="bg-success-500 size-[7px] rounded-full" />
                <span className="text-fg-subtle text-[11px] font-semibold">{mod.screen}</span>
              </div>

              <div className="p-[18px]">
                {mod.rows.map((row, index) => {
                  const tone = data.rows[index]?.tone ?? 'neutral';

                  return (
                    <div
                      key={row.title}
                      className="border-divider flex items-center gap-3 border-b py-3 last:border-0"
                    >
                      <span
                        className={`grid size-[30px] flex-none place-items-center rounded-[8px] font-mono text-[11px] font-bold ${TONE_CHIP[tone]}`}
                      >
                        {data.rows[index]?.key ?? ''}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold">
                          {row.title}
                        </span>
                        <span className="text-fg-subtle mt-0.5 block truncate text-xs">
                          {row.meta}
                        </span>
                      </span>

                      <span
                        className={`flex-none rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${TONE_CHIP[tone]}`}
                      >
                        {row.state}
                      </span>
                    </div>
                  );
                })}

                <p className="text-fg-subtle mt-3.5 text-xs leading-[1.5]">{mod.note}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- integrations */}
      <section data-sec className="bg-bg-subtle mt-[76px] border-t border-b">
        <div data-wrap>
          <div className={EYEBROW}>{t.page.intEyebrow}</div>
          <h2 data-h2 className={H2}>
            {t.page.intH}
          </h2>
          <p data-lede className={LEDE}>
            {t.page.intP}
          </p>

          <div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(min(230px,100%),1fr))] gap-3.5">
            {PAGE_INTEGRATIONS.map((integration, index) => {
              const words = t.integrations[index];

              return (
                <div
                  key={integration.key}
                  data-card
                  className={`${CARD} flex items-start gap-3.5 px-5 py-[18px]`}
                >
                  <span className="bg-bg-muted font-display text-fg-muted grid size-[34px] flex-none place-items-center rounded-[9px] text-xs font-bold">
                    {integration.key}
                  </span>

                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold">{integration.name}</div>
                    <div className={`text-fg-muted mt-0.5 text-xs leading-[1.5]`}>
                      {words?.body}
                    </div>
                    {/*
                     * Connected or not, in words as well as colour. Seven of the
                     * eight are live and one is not; a reader deciding whether
                     * their aggregator is supported needs to be able to tell
                     * which, without relying on a green.
                     */}
                    <div
                      className={`mt-1.5 text-[11px] font-semibold ${
                        integration.connected ? 'text-success-700' : 'text-fg-subtle'
                      }`}
                    >
                      {words?.state}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
