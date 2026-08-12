'use client';

import { useState } from 'react';
import { NextIntlClientProvider, useMessages } from 'next-intl';
import { formatTiyinAmount } from '@restaurant/utils';

import {
  DEFAULT_LOCALE,
  LANGUAGE_OPTIONS,
  messages as catalogues,
  type Locale,
  type Messages,
} from '@/i18n';
import { SignInPanel } from '@/components/sign-in-panel';
import { CONTACT, CONTACT_TEL } from '@/lib/constants';

import { COMPLIANCE, DOORS, FEATURES, MOCK_BARS, PLANS, QUOTES, ROLES, STATS } from './site-data';

import './marketing.css';
import { FaqList } from './faq-list';

/**
 * Smart Restaurant Cloud — the public site.
 *
 * Built to match `Smart Restaurant Cloud - Sayt.dc.html` rather than to
 * resemble it: every measure, radius and type size below is the prototype's own
 * value, read off its markup.
 *
 * Tailwind against the design's tokens throughout — `bg-brand-500`,
 * `text-fg-muted`, `font-display`. Two things stay in ./marketing.css: the
 * layout vocabulary the prototype declares as attributes (`data-wrap`,
 * `data-sec`), because its breakpoints key on those and a utility cannot select
 * on an attribute, and the hover states its runtime fakes.
 *
 * A note on the odd-looking arbitrary values: this project's radius scale is
 * the OS design's — sm 6, md 10, lg 14, xl 20 — and the marketing prototype
 * also reaches for 8, 11, 12 and 16, which have no token. Those are written out
 * rather than rounded to the nearest token, and the same goes for its 14px
 * running text, which sits between `text-sm` (13) and `text-md` (15).
 *
 * Copy lives in src/i18n under `marketing`, figures and proper nouns in
 * ./site-data.ts. Neither is written into the JSX.
 */

/**
 * The provider, and nothing else.
 *
 * The design switches the whole page the moment the pill is clicked, with no
 * navigation and no reload, so all three catalogues have to be in hand — which
 * is what `messages` from @/i18n gives. Re-rendering the provider with a
 * different locale is next-intl's own way of doing that.
 *
 * The console does it the other way round, through a cookie, because its pages
 * are server-rendered; see src/i18n/locale.ts.
 */
export default function MarketingPage() {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  return (
    <NextIntlClientProvider locale={locale} messages={catalogues[locale]}>
      <MarketingSite locale={locale} onLocale={setLocale} />
    </NextIntlClientProvider>
  );
}

function MarketingSite({ locale, onLocale }: { locale: Locale; onLocale: (next: Locale) => void }) {
  /*
   * `useMessages` rather than `useTranslations`, deliberately.
   *
   * Two thirds of this page is structured — six feature cards, seven roles,
   * three plans with their bullet lists. `t.raw('items')` hands those back as
   * `any`, while the catalogue's own type describes them exactly, so reading
   * the tree keeps the compiler checking every key. `t()` would only earn its
   * keep where there is interpolation or a plural, and there is neither here.
   */
  const m = (useMessages() as Messages).marketing;

  return (
    /*
     * Light only, and marked so explicitly.
     *
     * The design gives the marketing site no dark variant — its stylesheet has
     * a `:root` and nothing else — while the product has a full one. Without
     * this the page would follow whatever the visitor's OS prefers and render
     * in a theme the designer never drew, which is what it did on first build.
     */
    <div data-theme="light" lang={locale} className="bg-bg text-fg min-h-screen">
      {/* ------------------------------------------------------ header ---- */}
      <header className="bg-bg/[.82] sticky top-0 z-50 h-16 border-b backdrop-blur-[14px]">
        <div data-wrap className="flex h-16 items-center gap-8">
          <a href="#top" className="text-fg flex flex-none items-center gap-2.5">
            <span className="bg-brand-500 font-display grid size-[30px] flex-none place-items-center rounded-[8px] text-sm font-bold tracking-[-.02em] text-white">
              SR
            </span>
            <span className="font-display text-[16px] font-bold tracking-[-.02em] whitespace-nowrap">
              Smart Restaurant <span className="text-fg-subtle font-semibold">Cloud</span>
            </span>
          </a>

          <nav data-navlinks className="ml-1.5 flex items-center gap-[26px]">
            {[
              { href: '#product', label: m.nav.product },
              { href: '#roles', label: m.nav.roles },
              { href: '#pricing', label: m.nav.pricing },
              { href: '#faq', label: m.nav.faq },
            ].map((item) => (
              <a
                key={item.href}
                data-navlink
                href={item.href}
                className="text-fg-muted text-[14px] font-medium"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex-1" />

          <div className="bg-surface flex h-[34px] flex-none items-center gap-0.5 rounded-[9px] border px-[3px]">
            {LANGUAGE_OPTIONS.map((option) => {
              const active = option.code === locale;

              return (
                <button
                  key={option.code}
                  type="button"
                  lang={option.code}
                  onClick={() => onLocale(option.code)}
                  aria-pressed={active}
                  aria-label={option.label}
                  className={`h-[26px] cursor-pointer rounded-sm border-0 px-[9px] text-xs font-semibold ${
                    active ? 'bg-bg-muted text-fg' : 'text-fg-muted bg-transparent'
                  }`}
                >
                  {option.short}
                </button>
              );
            })}
          </div>

          <a
            data-hidesm
            data-btn-quiet
            href="#login"
            className="border-border-strong bg-surface text-fg inline-flex h-[38px] items-center rounded-md border px-[15px] text-[14px] font-semibold whitespace-nowrap"
          >
            {m.nav.login}
          </a>

          <a
            data-btn-brand
            href="#contact"
            className="bg-brand-500 inline-flex h-[38px] items-center rounded-md px-[17px] text-[14px] font-semibold whitespace-nowrap text-white"
          >
            {m.nav.demo}
          </a>
        </div>
      </header>

      <main>
        {/* ---------------------------------------------------- hero ---- */}
        <section
          id="top"
          className="from-bg via-bg to-bg-subtle border-b bg-linear-to-b via-60% pt-24"
        >
          <div data-wrap>
            <div
              data-hero
              className="grid [grid-template-columns:1.05fr_.95fr] items-center gap-14"
            >
              <div>
                <div className="bg-accent-50 rounded-pill inline-flex h-[30px] items-center gap-2 border border-[rgba(15,180,138,.22)] px-3">
                  <span className="bg-accent-500 rounded-pill size-1.5" />
                  <span className="text-accent-600 text-xs font-semibold">{m.hero.pill}</span>
                </div>

                <h1
                  data-h1
                  className="font-display mt-[22px] text-6xl leading-[1.06] font-bold tracking-[-.028em] text-balance"
                >
                  {m.hero.title}
                </h1>

                <p className="text-fg-muted mt-5 max-w-[520px] text-[19px] leading-[1.6] text-pretty">
                  {m.hero.body}
                </p>

                <div data-herobtn className="mt-8 flex items-center gap-3">
                  <a
                    data-btn-brand
                    href="#contact"
                    className="bg-brand-500 text-md inline-flex h-12 items-center justify-center rounded-[12px] px-6 font-semibold text-white shadow-sm"
                  >
                    {m.hero.cta1}
                  </a>
                  <a
                    data-btn-quiet
                    href="#product"
                    className="border-border-strong bg-surface text-fg text-md inline-flex h-12 items-center justify-center rounded-[12px] border px-[22px] font-semibold"
                  >
                    {m.hero.cta2}
                  </a>
                </div>

                <p className="text-fg-subtle mt-4 text-sm">{m.hero.note}</p>
              </div>

              <ProductMock mock={m.mock} />
            </div>

            {/* Four figures in a hairline grid, sitting on the section's edge:
                the -1px bottom margin lets the grid's border and the section's
                border share one line rather than stack into two. */}
            <dl
              data-stats
              className="bg-border mt-[72px] -mb-px grid grid-cols-4 gap-px overflow-hidden rounded-lg border"
            >
              {STATS.map((stat) => (
                // dt before dd in the DOM, value above label on screen.
                <div key={stat.key} className="bg-surface flex flex-col-reverse px-[22px] py-6">
                  <dt className="text-fg-subtle mt-1 text-sm">{m.stats[stat.key].label}</dt>
                  <dd className="font-display m-0 text-[34px] font-bold tracking-tight">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ------------------------------------------------- product ---- */}
        <section id="product" data-sec className="bg-bg-subtle border-b">
          <div data-wrap>
            <div className={EYEBROW}>{m.product.eyebrow}</div>
            <h2 data-h2 className={H2}>
              {m.product.title}
            </h2>
            <p data-lede className={LEDE}>
              {m.product.body}
            </p>

            <div data-three className="mt-11 grid grid-cols-3 gap-4">
              {FEATURES.map((feature) => (
                <div key={feature.key} data-card-lift className={`${CARD} p-6`}>
                  <div className="bg-brand-50 text-brand-600 font-display grid size-9 place-items-center rounded-md text-[14px] font-bold">
                    {feature.number}
                  </div>
                  <div className="mt-4 text-[16px] font-semibold tracking-[-.01em]">
                    {m.product.items[feature.key].title}
                  </div>
                  <p className={`text-fg-muted mt-[7px] ${BODY} text-pretty`}>
                    {m.product.items[feature.key].body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- roles ---- */}
        <section id="roles" data-sec className="border-b">
          <div data-wrap>
            <div className={EYEBROW}>{m.roles.eyebrow}</div>
            <h2 data-h2 className={H2}>
              {m.roles.title}
            </h2>
            <p data-lede className={LEDE}>
              {m.roles.body}
            </p>

            <div className="mt-11 overflow-hidden rounded-lg border">
              {ROLES.map((role) => (
                <div
                  key={role.initials}
                  data-two
                  data-role-row
                  className="border-divider bg-surface grid grid-cols-[200px_1fr] gap-6 border-b px-6 py-[22px]"
                >
                  <div className="flex items-center gap-3">
                    <span className="bg-bg-muted text-fg-muted rounded-pill grid size-[34px] flex-none place-items-center text-xs font-semibold">
                      {role.initials}
                    </span>
                    <span className="text-md font-semibold tracking-[-.01em]">
                      {m.roles.items[role.key].title}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <p className={`text-fg-muted ${BODY} text-pretty`}>
                      {m.roles.items[role.key].body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------- compliance ---- */}
        <section data-sec className="bg-bg-subtle border-b">
          <div data-wrap>
            <div data-two className="grid grid-cols-2 items-center gap-14">
              <div>
                <div className={EYEBROW}>{m.compliance.eyebrow}</div>
                <h2 data-h2 className={H2}>
                  {m.compliance.title}
                </h2>
                <p data-lede className={LEDE}>
                  {m.compliance.body}
                </p>
              </div>

              <div className="grid gap-3">
                {COMPLIANCE.map((key) => (
                  <div
                    key={key}
                    className="bg-surface flex items-start gap-3.5 rounded-[12px] border px-5 py-[18px]"
                  >
                    <span className="bg-success-50 rounded-pill mt-px grid size-5 flex-none place-items-center">
                      <Tick size={11} width={3.4} colour="var(--success-600)" />
                    </span>
                    <div>
                      <div className="text-[14px] font-semibold">
                        {m.compliance.items[key].title}
                      </div>
                      <div className="text-fg-muted mt-[3px] text-sm leading-[1.55]">
                        {m.compliance.items[key].body}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------- pricing ---- */}
        <section id="pricing" data-sec className="border-b">
          <div data-wrap>
            <div className={EYEBROW}>{m.pricing.eyebrow}</div>
            <h2 data-h2 className={H2}>
              {m.pricing.title}
            </h2>
            <p data-lede className={LEDE}>
              {m.pricing.body}
            </p>

            <div data-price className="mt-11 grid grid-cols-3 items-start gap-4">
              {PLANS.map((plan) => (
                <div
                  key={plan.key}
                  className={`bg-surface rounded-[16px] border p-7 ${
                    plan.highlighted ? 'border-brand-500 shadow-lg' : ''
                  }`}
                >
                  <div className="flex items-center gap-[9px]">
                    <span className="font-display text-[19px] font-bold tracking-[-.02em]">
                      {plan.name}
                    </span>
                    {plan.highlighted ? (
                      <span className="bg-brand-50 text-brand-600 rounded-pill text-2xs inline-flex h-[21px] items-center px-2 font-semibold">
                        {m.pricing.popular}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3.5 flex items-baseline gap-1.5">
                    {/* A price must never wrap mid-figure. */}
                    <span className="font-display text-[34px] font-bold tracking-[-.024em] whitespace-nowrap">
                      {plan.priceTiyin === null
                        ? m.pricing.plans.enterprise.price
                        : formatTiyinAmount(plan.priceTiyin, locale)}
                    </span>
                    {plan.priceTiyin === null ? null : (
                      <span className="text-fg-subtle text-sm">{m.pricing.month}</span>
                    )}
                  </div>

                  <div className="text-fg-subtle mt-[5px] text-sm">
                    {m.pricing.plans[plan.key].summary}
                  </div>
                  <div className="bg-divider my-5 h-px" />

                  <div className="grid gap-[11px]">
                    {m.pricing.plans[plan.key].items.map((item) => (
                      <div key={item} className="flex items-start gap-2.5">
                        <Tick
                          size={14}
                          width={3}
                          colour="var(--accent-600)"
                          className="mt-[3px] flex-none"
                        />
                        <span className="text-fg-muted text-[14px] leading-[1.5]">{item}</span>
                      </div>
                    ))}
                  </div>

                  <a
                    data-btn-quiet={plan.highlighted ? undefined : ''}
                    data-btn-brand={plan.highlighted ? '' : undefined}
                    href="#contact"
                    className={`mt-6 flex h-[42px] items-center justify-center rounded-md border text-[14px] font-semibold ${
                      plan.highlighted
                        ? 'bg-brand-500 border-brand-500 text-white'
                        : 'border-border-strong bg-surface text-fg'
                    }`}
                  >
                    {m.pricing.cta}
                  </a>
                </div>
              ))}
            </div>

            <p className="text-fg-subtle mt-5 text-sm">{m.pricing.note}</p>
          </div>
        </section>

        {/* -------------------------------------------- testimonials ---- */}
        <section data-sec className="bg-bg-subtle border-b">
          <div data-wrap>
            <div className={EYEBROW}>{m.quotes.eyebrow}</div>
            <h2 data-h2 className={H2}>
              {m.quotes.title}
            </h2>

            <div data-three className="mt-11 grid grid-cols-3 gap-4">
              {QUOTES.map((quote) => (
                <figure key={quote.initials} className={`${CARD} m-0 flex flex-col p-[26px]`}>
                  <blockquote className="text-fg text-md m-0 flex-1 leading-[1.65] text-pretty">
                    {m.quotes.items[quote.key].quote}
                  </blockquote>
                  <figcaption className="border-divider mt-[22px] flex items-center gap-[11px] border-t pt-[18px]">
                    <span className="bg-bg-muted text-fg-muted rounded-pill grid size-9 flex-none place-items-center text-xs font-semibold">
                      {quote.initials}
                    </span>
                    <div>
                      <div className="text-[14px] font-semibold">{quote.name}</div>
                      <div className="text-fg-subtle mt-px text-xs">
                        {m.quotes.items[quote.key].role}
                      </div>
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------- faq ---- */}
        <section id="faq" data-sec className="border-b">
          <div data-wrap>
            <div data-two className="grid grid-cols-[360px_1fr] items-start gap-14">
              <div>
                <div className={EYEBROW}>{m.faq.eyebrow}</div>
                <h2 data-h2 className={H2}>
                  {m.faq.title}
                </h2>
                <p className="text-fg-muted text-md mt-4 leading-[1.6]">{m.faq.body}</p>
                <a
                  href="#contact"
                  className="text-brand-600 mt-[18px] inline-flex items-center gap-[7px] text-[14px] font-semibold"
                >
                  {m.faq.link} <span aria-hidden>→</span>
                </a>
              </div>

              <FaqList />
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- login ---- */}
        <section id="login" data-sec className="bg-bg-subtle border-b">
          <div data-wrap>
            <div data-two className="grid grid-cols-[1fr_460px] items-center gap-14">
              <div>
                <div className={EYEBROW}>{m.signin.eyebrow}</div>
                <h2 data-h2 className={H2}>
                  {m.signin.title}
                </h2>
                <p data-lede className={LEDE}>
                  {m.signin.body}
                </p>

                <div className="mt-8 grid max-w-[520px] gap-3.5">
                  {DOORS.map((door) => (
                    <div key={door.key} className="flex items-start gap-3.5">
                      <span className="bg-surface text-fg-muted text-2xs mt-px grid size-[26px] flex-none place-items-center rounded-[8px] border font-bold">
                        {door.number}
                      </span>
                      <div>
                        <div className="text-md font-semibold">
                          {m.signin.doors[door.key].title}
                        </div>
                        <div className="text-fg-muted mt-0.5 text-[14px] leading-[1.55]">
                          {m.signin.doors[door.key].body}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <SignInPanel />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------- contact ---- */}
        <section id="contact" data-sec className="bg-[var(--n-900)]">
          <div data-wrap>
            <div data-two className="grid grid-cols-[1fr_420px] items-center gap-14">
              <div>
                <h2 data-h2 className={`${H2} text-white`}>
                  {m.contact.title}
                </h2>
                <p className="mt-4 max-w-[480px] text-[17px] leading-[1.6] text-pretty text-white/[.66]">
                  {m.contact.body}
                </p>

                <div className="mt-[30px] flex flex-wrap gap-3">
                  <a
                    data-btn-brand
                    href={CONTACT_TEL}
                    className="bg-brand-500 text-md inline-flex h-12 items-center rounded-[12px] px-[22px] font-semibold text-white"
                  >
                    {m.contact.cta1}
                  </a>
                  <a
                    data-dark-btn
                    href="#pricing"
                    className="text-md inline-flex h-12 items-center rounded-[12px] border border-white/[.16] bg-white/[.09] px-[22px] font-semibold text-white"
                  >
                    {m.contact.cta2}
                  </a>
                </div>
              </div>

              <div className="rounded-[16px] border border-white/10 bg-white/5 p-[26px]">
                <div className="tracking-caps text-xs font-semibold text-white/45 uppercase">
                  {m.contact.call}
                </div>
                <a
                  href={CONTACT_TEL}
                  className="font-display mt-2.5 block text-[28px] font-bold tracking-[-.02em] text-white"
                >
                  {CONTACT.phone}
                </a>

                <div className="my-5 h-px bg-white/10" />

                <div className="grid gap-3">
                  <ContactRow
                    label="Telegram"
                    value={CONTACT.telegram}
                    href={CONTACT.telegramUrl}
                  />
                  <ContactRow
                    label={m.contact.mail}
                    value={CONTACT.email}
                    href={`mailto:${CONTACT.email}`}
                  />
                  <ContactRow label={m.contact.hours} value={m.contact.hoursValue} />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ------------------------------------------------------ footer ---- */}
      <footer className="border-t border-white/[.09] bg-[var(--n-900)] py-11">
        <div data-wrap className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-2.5">
            <span className="font-display text-2xs grid size-[26px] place-items-center rounded-[7px] bg-white/[.12] font-bold text-white">
              SR
            </span>
            <span className="text-[14px] text-white/55">
              © 2026 Smart Restaurant Cloud · {m.footer.rights}
            </span>
          </div>

          {/* Terms and privacy point back up the page until those routes exist
              — the prototype does the same rather than promising a 404. */}
          <nav className="flex gap-[22px]">
            {[
              { href: '#top', label: m.footer.terms },
              { href: '#top', label: m.footer.privacy },
              { href: '#login', label: m.nav.login },
            ].map((link) => (
              <a
                key={link.label}
                data-footlink
                href={link.href}
                className="text-[14px] text-white/55"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** The section opening the design repeats seven times. */
const EYEBROW = 'text-brand-600 text-xs font-semibold tracking-caps uppercase';
const H2 = 'font-display mt-3.5 text-[44px] leading-[1.12] font-bold tracking-tight';
const LEDE = 'text-fg-muted mt-4 max-w-[620px] text-[18px] leading-[1.6] text-pretty';

/** The prototype's running text: 14px on 1.6, between our two body tokens. */
const BODY = 'text-[14px] leading-[1.6]';
const CARD = 'bg-surface rounded-lg border';

/**
 * The dashboard still in the hero.
 *
 * Bar heights are in px, straight from the design — a percentage would resolve
 * against a parent with no resolved height and collapse the chart to nothing.
 */

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

function ContactRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[14px] text-white/[.62]">{label}</span>
      {href ? (
        <a href={href} className="text-[14px] font-semibold text-white">
          {value}
        </a>
      ) : (
        <span className="text-[14px] font-semibold text-white">{value}</span>
      )}
    </div>
  );
}

/**
 * The product still in the hero, in browser chrome.
 *
 * Hand-built rather than a screenshot: a screenshot goes stale the first time
 * the product changes, renders soft on a high-density display, and cannot
 * follow the reader's language — which this one does.
 */
function ProductMock({ mock }: { mock: Messages['marketing']['mock'] }) {
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
          <MockTile
            label={mock.revenue}
            value="18 420 000"
            unit={mock.som}
            delta="+12.4%"
            rail={74}
          />
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
                style={{ height }}
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
      <div className="font-display mt-[3px] text-2xl font-bold tracking-[-.02em]">{value}</div>
      <div className="mt-0.5 flex items-center gap-[5px]">
        <span className="text-fg-subtle text-2xs">{unit}</span>
        <span className="text-success-600 text-2xs font-semibold">{delta}</span>
      </div>
      <div className="bg-bg-muted rounded-pill mt-[9px] h-[3px] overflow-hidden">
        <div
          style={{ width: `${rail}%` }}
          className={`rounded-pill h-full ${accent ? 'bg-accent-500' : 'bg-brand-500'}`}
        />
      </div>
    </div>
  );
}
