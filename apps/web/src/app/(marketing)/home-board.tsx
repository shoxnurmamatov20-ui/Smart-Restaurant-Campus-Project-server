'use client';

import Link from 'next/link';
import { useLocale } from 'next-intl';

import { type Locale } from '@/i18n';
import { StoreBadges } from '@/components/store-badges';

import { MOCK_BARS, QUOTES, STATS } from './site-data';
import { pagesCopy, type SitePages } from './pages-copy';
import { PAGE_CHANGES, PAGE_DEVICES } from './pages-data';
import { CARD, EYEBROW, H2, LEDE } from './page-ui';

/**
 * Smart Restaurant Cloud — the home page.
 *
 * Built to match `Smart Restaurant Cloud - Sayt v2.dc.html:137-341` rather than
 * to resemble it: every measure, radius and type size below is the prototype's
 * own value, read off its markup.
 *
 * ---------------------------------------------------------------------------
 * Five sections, and why six others were deleted
 *
 * This file used to be the entire website: a hero, then a summary of every
 * other page — product, roles, pricing, FAQ, sign-in, contact — stacked as
 * anchored sections, because at the time those pages did not exist and the nav
 * scrolled instead of navigating. They exist now, and v2's home page is five
 * sections long: hero, what changes, devices, compliance, customers. Keeping
 * the summaries would have meant six routes each of which the home page also
 * half-answered, with two copies of every number and only one of them
 * maintained — which is exactly how the roles list came to claim eight roles
 * above a list of seven while the product had nine.
 *
 * The closing call to action and the footer are not here either: v2 draws both
 * around every page (`showCta` at 1644), so they live in `site-chrome.tsx`.
 *
 * Copy comes from `pages-copy.ts`, transcribed from the design file itself, and
 * the structure that is not prose — bar heights, device outlines, initials —
 * from `pages-data.ts` and `site-data.ts`. Neither is written into the JSX.
 */
export function HomeBoard({
  /** The published APK, read on the server by `page.tsx`; null until `srcp-apk` has run. */
  apkHref,
}: {
  apkHref: string | null;
}) {
  /* The reader's language. The words come from the provider the layout wraps
     this page in; this is the key into the same design-file catalogue every
     other page on the site reads. */
  const locale = useLocale() as Locale;
  const p = pagesCopy(locale);

  return (
    <>
      {/* ---------------------------------------------------- hero ---- */}
      <section
        id="top"
        data-pagetop
        className="from-bg via-bg to-bg-subtle border-b bg-linear-to-b via-60% pt-[88px]"
      >
        <div data-wrap>
          <div data-hero className="grid [grid-template-columns:1.05fr_.95fr] items-center gap-14">
            <div>
              <div
                data-eyebrow
                className="bg-accent-50 rounded-pill inline-flex h-[30px] items-center gap-2 border border-[rgba(15,180,138,.22)] px-3"
              >
                <span className="bg-accent-500 rounded-pill size-1.5 shrink-0" />
                <span className="text-accent-600 text-xs font-semibold">{p.page.heroPill}</span>
              </div>

              <h1
                data-h1
                className="font-display mt-5 text-[58px] leading-[1.06] font-bold tracking-[-.028em] text-balance"
              >
                {p.page.heroH}
              </h1>

              <p className="text-fg-muted mt-5 max-w-[520px] text-[19px] leading-[1.6] text-pretty">
                {p.page.heroP}
              </p>

              {/*
               * Routes, not anchors. Both of these used to be `#contact` and
               * `#product`, which scrolled to a section of this page — so the
               * primary call to action on the whole site moved a reader 4 000
               * pixels down and left them on the same document.
               */}
              <div data-herobtn className="mt-8 flex items-center gap-3">
                <Link
                  data-btn-brand
                  data-press
                  href="/contact"
                  className="bg-brand-500 text-md inline-flex h-12 items-center justify-center rounded-[12px] px-6 font-semibold text-white shadow-sm"
                >
                  {p.page.heroCta1}
                </Link>
                <Link
                  data-btn-quiet
                  data-press
                  href="/product"
                  className="border-border-strong bg-surface text-fg text-md inline-flex h-12 items-center justify-center rounded-[12px] border px-[22px] font-semibold"
                >
                  {p.page.heroCta2}
                </Link>
              </div>

              <p className="text-fg-subtle mt-4 text-sm">{p.page.heroNote}</p>
            </div>

            <ProductMock mock={p.mock} />
          </div>

          {/* Four figures in a hairline grid, sitting on the section's edge:
                the -1px bottom margin lets the grid's border and the section's
                border share one line rather than stack into two. */}
          <dl
            data-stats
            className="bg-border mt-[72px] -mb-px grid grid-cols-4 gap-px overflow-hidden rounded-lg border"
          >
            {STATS.map((stat, index) => (
              // dt before dd in the DOM, value above label on screen.
              <div key={stat.key} className="bg-surface flex flex-col-reverse px-[22px] py-6">
                <dt className="text-fg-subtle mt-1 text-sm">{p.stats[index]}</dt>
                <dd className="font-display m-0 text-[34px] font-bold tracking-[-.022em]">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* --------------------------------------------- what changes ---- */}
      {/*
       * Three before/after cards — `Sayt v2.dc.html:221-247`.
       *
       * The one section on the home page that names a problem before it names
       * a product. Each card closes with a quantified pill, which is what stops
       * "better visibility" from being the kind of sentence every system on the
       * market prints.
       */}
      <section data-sec className="bg-bg-subtle border-b">
        <div data-wrap>
          <div className={EYEBROW}>{p.page.painEyebrow}</div>
          <h2 data-h2 className={H2}>
            {p.page.painH}
          </h2>
          <p data-lede className={LEDE}>
            {p.page.painP}
          </p>

          <div data-three className="mt-11 grid grid-cols-3 gap-4">
            {p.changes.map((change, index) => (
              <div key={change.before} data-card className={`${CARD} p-[26px]`}>
                <div className="flex items-center gap-2.5">
                  <span aria-hidden className="bg-danger-500 size-[7px] flex-none rounded-full" />
                  <span className="text-danger-600 text-xs font-semibold tracking-wide uppercase">
                    {p.page.painBefore}
                  </span>
                </div>
                <p className="mt-3 text-[16px] leading-[1.45] font-semibold tracking-[-.01em]">
                  {change.before}
                </p>

                <div className="bg-divider my-5 h-px" />

                <div className="flex items-center gap-2.5">
                  <span aria-hidden className="bg-success-500 size-[7px] flex-none rounded-full" />
                  <span className="text-success-700 text-xs font-semibold tracking-wide uppercase">
                    {p.page.painAfter}
                  </span>
                </div>
                <p className="text-fg-muted mt-3 text-[14px] leading-[1.6] text-pretty">
                  {change.after}
                </p>

                <div className="bg-success-50 mt-4 inline-flex items-baseline gap-2 rounded-full px-3 py-[7px]">
                  <span
                    data-num
                    className="font-display text-success-700 text-[17px] font-bold tracking-[-.01em]"
                  >
                    {PAGE_CHANGES[index]?.metric}
                  </span>
                  <span className="text-success-700 text-xs">{change.metricLabel}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- devices ---- */}
      {/*
       * Five device cards — `dc.html:250-270`. Which workplace gets which
       * screen, drawn as the outline of the device itself, because "the kitchen
       * screen is not the tablet screen" is the claim and a list of words does
       * not make it.
       */}
      <section data-sec className="border-b">
        <div data-wrap>
          <div className={EYEBROW}>{p.page.surfEyebrow}</div>
          <h2 data-h2 className={H2}>
            {p.page.surfH}
          </h2>
          <p data-lede className={LEDE}>
            {p.page.surfP}
          </p>

          <div className="mt-11 grid grid-cols-[repeat(auto-fit,minmax(min(210px,100%),1fr))] gap-4">
            {p.devices.map((device, index) => {
              const shape = PAGE_DEVICES[index];

              return (
                <div key={device.title} data-card className={`${CARD} p-[22px]`}>
                  <div className="flex h-[74px] items-end justify-center pb-1.5">
                    <div
                      aria-hidden
                      className="border-n-300 bg-bg-subtle relative border-2"
                      style={{
                        width: shape?.width,
                        height: shape?.height,
                        borderRadius: shape?.radius,
                      }}
                    >
                      <div className="bg-brand-100 absolute inset-[4px] rounded-[2px]" />
                    </div>
                  </div>

                  <div className="mt-3.5 text-[15px] font-semibold tracking-[-.01em]">
                    {device.title}
                  </div>
                  <div className="text-fg-muted mt-1.5 text-[13px] leading-[1.55]">
                    {device.body}
                  </div>
                  <div className="text-fg-subtle mt-2.5 font-mono text-xs">{device.who}</div>
                </div>
              );
            })}
          </div>

          {/*
           * The way out of this section, and the only one on the home page.
           *
           * Four of the five cards above are a phone or a tablet, and a reader
           * who has just been told "every workplace gets its own screen" is
           * thinking about the device in their hand. The design has no button
           * here because it had no app to hand out; `/download` is not in the
           * header either, which is why it needs this — six nav items is the
           * design's own count and `pages-fidelity.test.ts` keeps it there.
           */}
          {/* The store badges a restaurant owner recognises from every other
              app's site, and a quiet link to the page that explains them. */}
          <div className="mt-[26px]">
            <StoreBadges copy={p.download.badges} apkHref={apkHref} />
          </div>
          <Link
            data-btn-quiet
            data-press
            href="/download"
            className="border-border-strong bg-surface text-fg mt-4 inline-flex h-11 items-center gap-[7px] rounded-[11px] border px-[18px] text-[14px] font-semibold"
          >
            {p.page.fDownload} <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      {/* ----------------------------------------------- compliance ---- */}
      <section data-sec className="bg-bg-subtle border-b">
        <div data-wrap>
          <div data-two className="grid grid-cols-2 items-center gap-14">
            <div>
              <div className={EYEBROW}>{p.page.cEyebrow}</div>
              <h2 data-h2 className={H2}>
                {p.page.cH}
              </h2>
              <p data-lede className={LEDE}>
                {p.page.cP}
              </p>

              {/* The design's own way out of this section, and it was missing:
                  a reader who is convinced by "we handle soliq.uz" wants the
                  list of what else is already wired up, which is a section of
                  /product. */}
              <Link
                data-btn-quiet
                data-press
                href="/product"
                className="border-border-strong bg-surface text-fg mt-[22px] inline-flex h-11 items-center gap-[7px] rounded-[11px] border px-[18px] text-[14px] font-semibold"
              >
                {p.page.cLink} <span aria-hidden>→</span>
              </Link>
            </div>

            <div className="grid gap-3">
              {p.compliance.map((item) => (
                <div
                  key={item.title}
                  className="bg-surface flex items-start gap-3.5 rounded-[12px] border px-5 py-[18px]"
                >
                  <span className="bg-success-50 rounded-pill mt-px grid size-5 flex-none place-items-center">
                    <Tick size={11} width={3.4} colour="var(--success-600)" />
                  </span>
                  <div>
                    <div className="text-[14px] font-semibold">{item.title}</div>
                    <div className="text-fg-muted mt-[3px] text-sm leading-[1.55]">{item.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ customers ---- */}
      <section data-sec className="border-b">
        <div data-wrap>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className={EYEBROW}>{p.page.tEyebrow}</div>
              <h2 data-h2 className={H2}>
                {p.page.tH}
              </h2>
              {/*
               * Said before the cards rather than in a footnote under them.
               *
               * These three were written as customer testimonials — named
               * people, named restaurants, four cities — for a platform that
               * has no customers yet. The cards are worth keeping: they are the
               * situations the system is built around. What they may not do is
               * claim somebody said them.
               */}
              <p className="text-fg-subtle mt-2 max-w-[62ch] text-sm leading-relaxed">
                {p.page.tNote}
              </p>
            </div>

            <Link
              data-btn-quiet
              data-press
              href="/customers"
              className="border-border-strong bg-surface text-fg inline-flex h-[42px] flex-none items-center rounded-[11px] border px-[17px] text-[14px] font-semibold whitespace-nowrap"
            >
              {p.page.tAll}
            </Link>
          </div>

          <div data-three className="mt-9 grid grid-cols-3 gap-4">
            {QUOTES.map((quote, index) => (
              <figure key={quote.key} className={`${CARD} m-0 flex flex-col p-[26px]`}>
                <blockquote className="text-fg text-md m-0 flex-1 leading-[1.65] text-pretty">
                  {p.quotes[index]?.quote}
                </blockquote>
                {/*
                 * The role, and no name. The circle carried two initials of a
                 * person who does not exist; a quotation mark says the same
                 * thing about the card's shape without inventing anybody.
                 */}
                <figcaption className="border-divider mt-[22px] flex items-center gap-[11px] border-t pt-[18px]">
                  <span
                    aria-hidden
                    className="bg-bg-muted text-fg-muted rounded-pill grid size-9 flex-none place-items-center text-base font-semibold"
                  >
                    ”
                  </span>
                  <div className="text-[14px] font-semibold">{p.quotes[index]?.role}</div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */

function Tick({
  size,
  width,
  colour,
  className,
}: {
  size: number;
  width: number;
  colour: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colour}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * The product still in the hero, in browser chrome.
 *
 * Hand-built rather than a screenshot: a screenshot goes stale the first time
 * the product changes, renders soft on a high-density display, and cannot
 * follow the reader's language — which this one does.
 */
function ProductMock({ mock }: { mock: SitePages['mock'] }) {
  return (
    <div className="bg-surface overflow-hidden rounded-[16px] border shadow-xl">
      <div className="border-divider bg-bg-subtle flex h-[38px] items-center gap-[7px] border-b px-3.5">
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="rounded-pill size-[9px] bg-[var(--n-200)]" />
        ))}
        <span className="text-fg-subtle text-2xs ml-2.5 font-medium">app.smartrestaurant.uz</span>
      </div>

      <div className="p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-fg-subtle text-2xs tracking-caps font-semibold uppercase">
              {mock.date}
            </div>
            <div className="font-display mt-1 text-[22px] font-bold tracking-[-.02em]">
              {mock.branch}
            </div>
          </div>
          <div className="flex gap-[3px] rounded-[8px] border p-0.5">
            <span className="bg-surface text-2xs rounded-sm px-[9px] py-1 font-semibold shadow-xs">
              {mock.day}
            </span>
            <span className="text-fg-subtle text-2xs rounded-sm px-[9px] py-1 font-semibold">
              {mock.week}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {/* "so'm" is the same word in all three languages and the design
              writes it into the markup rather than its `t` object. */}
          <MockTile label={mock.revenue} value="18 420 000" unit="so'm" delta="+12.4%" rail={74} />
          <MockTile
            label={mock.orders}
            value="192"
            unit={mock.closed}
            delta="+8"
            rail={80}
            accent
          />
        </div>

        <div className="mt-2.5 rounded-[12px] border p-3.5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold">{mock.chart}</div>
            <div className="text-success-600 text-2xs font-semibold">+10.2%</div>
          </div>
          <div className="mt-3 flex h-[74px] items-end gap-1.5">
            {MOCK_BARS.map((height, index) => (
              <div
                key={index}
                data-bar="1"
                style={{ height, animationDelay: `${index * 0.03}s` }}
                className={`flex-1 rounded-t-[3px] ${
                  index === MOCK_BARS.length - 1 ? 'bg-brand-500' : 'bg-brand-200'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="bg-warning-50 mt-2.5 flex items-center gap-2 rounded-[12px] border border-[rgba(247,144,9,.24)] px-[13px] py-[11px]">
          <span className="bg-warning-500 rounded-pill size-[7px] flex-none" />
          <span className="text-warning-600 text-xs font-semibold">{mock.alert}</span>
        </div>
      </div>
    </div>
  );
}

function MockTile({
  label,
  value,
  unit,
  delta,
  rail,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  delta: string;
  rail: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-[12px] border p-[13px]">
      <div className="text-fg-subtle text-2xs font-medium">{label}</div>
      <div data-num className="font-display mt-[3px] text-2xl font-bold tracking-[-.02em]">
        {value}
      </div>
      <div className="mt-0.5 flex items-center gap-[5px]">
        <span className="text-fg-subtle text-2xs">{unit}</span>
        <span className="text-success-600 text-2xs font-semibold">{delta}</span>
      </div>
      <div data-rail className="bg-bg-muted rounded-pill mt-[9px] h-[3px] overflow-hidden">
        <div
          style={{ width: `${rail}%` }}
          className={`rounded-pill h-full ${accent ? 'bg-accent-500' : 'bg-brand-500'}`}
        />
      </div>
    </div>
  );
}
