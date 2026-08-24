'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMessages } from 'next-intl';

import { useTheme } from '@/components/providers/theme-provider';
import { APP_VERSION, CONTACT, CONTACT_TEL } from '@/lib/constants';
import { LANGUAGE_OPTIONS, type Locale } from '@/i18n';
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from '@/i18n/locale';
import { splitLocale, withLocale } from '@/lib/locale-path';
import type { Messages } from '@/i18n';

import { pagesCopy } from './pages-copy';
import { SIGN_IN_HREF, SITE_NAV } from './site-data';

/**
 * The header, the closing call to action and the footer the whole public site
 * shares.
 *
 * Extracted from `page.tsx`, which used to be the entire website: one client
 * component with the header, seven anchored sections and the footer in it. The
 * design (`Smart Restaurant Cloud - Sayt v2.dc.html`) is not one page — it is
 * eight, and its nav switches between them. Six of those eight did not exist
 * here, so the nav pointed at anchors that scrolled to a summary of a page
 * rather than to the page.
 *
 * ---------------------------------------------------------------------------
 * Two things the header was missing
 *
 * **A burger.** `marketing.css` hides `[data-navlinks]` below 1180px and put
 * nothing in its place, so on every phone and most tablets the site had no
 * navigation whatsoever — the logo, two buttons, and no way to reach pricing.
 * That is not a styling nit; it is the majority of the traffic a restaurant
 * marketing site gets.
 *
 * **A language choice that survives.** The pill was `useState` in the page, so
 * a reader who picked Russian and clicked "Pricing" got Uzbek back. It writes a
 * cookie now, which the layout reads on the server, so the choice holds across
 * navigations and reloads.
 */
/**
 * A year, path-wide, not `httpOnly`: the control that sets it is here in the
 * browser and a language is not a secret.
 *
 * It writes `LOCALE_COOKIE` and no longer `SITE_LANG_COOKIE`, and that is the
 * end of a bug rather than a rename. The site kept its own second cookie, so a
 * reader who chose Russian here and walked into the console got Uzbek — two
 * memories of one choice, disagreeing. Nothing renders from this now either:
 * the language is in the URL, and this is only what an *unprefixed* address
 * gets redirected to when someone types `oshxona.uz/pricing` from scratch.
 *
 * At module scope rather than inside the component, and that is the compiler's
 * rule rather than a preference — `react-hooks/immutability` rejects a write
 * to `document` from a function declared in a component body, because such a
 * function may be memoised and the write would then not happen on every call
 * that appears to make it.
 */
function rememberLanguage(code: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${code};path=/;max-age=${LOCALE_COOKIE_MAX_AGE};samesite=lax`;
}

export function SiteChrome({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const m = (useMessages() as Messages).marketing;
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  /*
   * The path without its language, and the links with one.
   *
   * `usePathname()` returns what the address bar says — `/uz/pricing` — while
   * `SITE_NAV` is written in the bare paths the app actually routes. Comparing
   * the two directly is the quiet failure this migration invites everywhere:
   * no row ever matches, so nothing is ever marked as the current page and
   * `aria-current` disappears, and the screen still looks fine.
   *
   * Prefixing the hrefs is the other half. A bare `/pricing` would still work
   * — the middleware would redirect it to this reader's language — but it
   * would cost a round trip on every click and would drop them into whatever
   * their cookie last said rather than the language they are reading now.
   */
  const here = splitLocale(pathname).bare;
  const links = SITE_NAV.map((item) => ({
    href: withLocale(item.href, locale),
    bare: item.href,
    label: m.nav[item.key],
  }));

  /*
   * One function rather than two copies of it — the segmented pill and the
   * phone's chip are the same choice drawn at two widths, and a cookie name
   * written out twice is a cookie name that drifts.
   */
  const pickLanguage = (code: Locale) => {
    rememberLanguage(code);

    /*
     * A document navigation, and both halves of that are deliberate.
     *
     * *A navigation* because `router.refresh()` was what the owner meant by
     * the page "playing". It re-fetched every server component and swapped
     * them in place: measured on a phone, **1327 ms** in which nothing moved
     * and the old language stayed on screen, then everything changed at once
     * and the scroll landed 16px off — with the address bar still naming the
     * language the page was no longer in.
     *
     * *A document* one, rather than `router.push`, because `<html lang>` is
     * set by the root layout from a request header, and a client-side
     * navigation does not re-render a root layout. Pushing would have changed
     * every visible word and left the document announcing the wrong language
     * to screen readers and crawlers — the exact defect this whole migration
     * exists to close. It does not work anyway: the middleware rewrites
     * `/ru/…` onto the unprefixed route, so the client router sees the tree it
     * is already rendering and keeps the old URL. Measured — the address bar
     * did not move.
     *
     * So the browser loads the language's own URL, which is what following a
     * link to it would do, and what every other site with languages in its
     * paths does.
     */
    const { bare } = splitLocale(pathname);
    const { search, hash } = window.location;

    window.location.assign(`${withLocale(bare, code)}${search}${hash}`);
  };

  return (
    /*
     * Day and night, on a surface the design drew only in daylight.
     *
     * This was `data-theme="light"`, pinned, and the reasoning above it was
     * sound: the marketing stylesheet has a `:root` and nothing else, so
     * following the visitor's OS would have rendered a theme nobody drew.
     *
     * The owner asked for the switch anyway — the same call that put Kun · Tun
     * in the staff app — so the missing half is drawn rather than refused. It
     * costs less than it looks: every colour on these pages already comes from
     * a token, and the product's dark palette redefines all but thirteen of
     * them. Those thirteen are filled in `marketing.css` under
     * `[data-theme='dark']`, which is the only place this surface disagrees
     * with the product's own night.
     *
     * `lang` stays on this element: it is the document language for everything
     * inside, and the theme is now the browser's to decide.
     */
    <div data-marketing lang={locale} className="bg-bg text-fg min-h-dvh">
      <header
        data-sitehead
        className="bg-bg/[.82] sticky top-0 z-50 h-16 border-b backdrop-blur-[14px]"
      >
        {/* 18px, where the design says 30 (`dc.html:92`) — and the twelve are
            the difference between a bar that fits and one that does not. See
            the arithmetic in marketing.css: at 1200px the wrap gives the row
            1136px and Russian wanted 1203 of them. `data-navbar` steps it down
            again in marketing.css at each width where the bar runs out. */}
        <div data-wrap data-navbar className="flex h-16 items-center gap-[18px]">
          {/*
           * The name, and no mark beside it.
           *
           * The design draws a 30px `SR` square here and the owner asked for it
           * to go: on a phone it was the only thing left of the brand — the
           * words were hidden below 600px — so the site introduced itself with
           * two letters nobody outside the company can expand. The words are
           * the brand; they now stay at every width and the square is gone from
           * the bar. It survives in the footer, where the lockup has room.
           *
           * Below 600 the same words stack into a two-line lockup rather than
           * shrinking to nothing — see `[data-wordmark]` in marketing.css.
           * 185px of unshrinkable single line is two thirds of a 320px bar;
           * stacked it is 104, and it still reads as a logo.
           */}
          <Link
            data-navbrand
            href={withLocale('/', locale)}
            aria-label="Smart Restaurant Cloud"
            className="text-fg flex flex-none items-center"
          >
            <span
              data-wordmark
              className="font-display text-[16px] leading-none font-bold tracking-[-.02em] whitespace-nowrap"
            >
              <span data-wordmark-name>Smart Restaurant</span>{' '}
              <span data-wordmark-tail className="text-fg-subtle font-semibold">
                Cloud
              </span>
            </span>
          </Link>

          {/*
           * The link row — `dc.html:98-105`: a 4px gap with the padding inside
           * each link, every label `nowrap`, and the current page underlined.
           *
           * It was `gap-[26px]` between bare text links and no `nowrap`, which
           * is what put "Kim uchun" on two lines in the middle of a desktop
           * bar: the row wanted 1214px (Uzbek) and 1235 (Russian) inside a
           * 1200px wrap, so flex shrank the items and the two-word labels broke.
           * Padding inside the link also gives the pointer a target the height
           * of the bar rather than the height of the text.
           */}
          <nav data-navlinks className="-ml-[9px] flex items-center gap-1">
            {links.map((item) => {
              const on = here === item.bare || here.startsWith(`${item.bare}/`);

              return (
                <Link
                  key={item.href}
                  data-navlink
                  data-on={on ? '1' : undefined}
                  aria-current={on ? 'page' : undefined}
                  href={item.href}
                  className="text-fg-muted relative flex h-[38px] flex-none items-center px-[9px] text-[14px] font-medium whitespace-nowrap"
                >
                  {item.label}
                  {/* The design's own current-page mark. Inside the link and
                      inset by its padding, so it underlines the word rather
                      than the target. */}
                  <span
                    data-underline
                    aria-hidden
                    className="bg-brand-500 pointer-events-none absolute inset-x-[9px] -bottom-px h-0.5 rounded-full opacity-0"
                  />
                </Link>
              );
            })}
          </nav>

          <div data-navspacer className="flex-1" />

          {/* Below 720 this moves into the sheet — see the copy of it there.
              A language is a preference rather than navigation, and three
              buttons is 110px of a bar that has a brand and a call to action to
              fit first. */}
          <div
            data-langpill
            className="bg-surface flex h-[34px] flex-none items-center gap-0.5 rounded-[9px] border px-[3px]"
          >
            {LANGUAGE_OPTIONS.map((option) => {
              const active = option.code === locale;

              return (
                <button
                  key={option.code}
                  type="button"
                  lang={option.code}
                  onClick={() => pickLanguage(option.code)}
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

          {/* The same choice, in the width a phone has for it. One of the two
              is drawn at any width — see `[data-langchip]` in marketing.css. */}
          <LanguageChip locale={locale} onPick={pickLanguage} />

          {/* Beside the language, because both are preferences rather than
              places, and both stay in the bar at every width. */}
          <ThemeSwitch label={m.nav.theme} />

          {/*
           * In the bar at every width — a deliberate step away from the design,
           * which hides it below 600px (`data-hidesm`) and leaves it inside the
           * burger. The owner's call: a restaurant's staff reach their console
           * from a phone and should not have to open a menu to find the door.
           * `data-navlogin` narrows its padding where the bar is tight.
           */}
          <Link
            data-navlogin
            data-btn-quiet
            data-press
            href={withLocale(SIGN_IN_HREF, locale)}
            className="border-border-strong bg-surface text-fg inline-flex h-[38px] flex-none items-center rounded-md border px-[15px] text-[14px] font-semibold whitespace-nowrap"
          >
            {m.nav.login}
          </Link>

          <Link
            data-btn-brand
            data-navdemo
            data-press
            href={withLocale('/contact', locale)}
            className="bg-brand-500 inline-flex h-[38px] items-center rounded-md px-[17px] text-[14px] font-semibold whitespace-nowrap text-white"
          >
            {/* One label. It used to carry two — the full wording down to
                600px and a one-word "Demo" under it — because the button stayed
                in the bar at every width and 320px had room for nothing longer.
                Below 600 the button is in the sheet now, at full width, where
                the full wording fits, so the short form had no width left to
                appear at. `nav.demoShort` stays in the catalogues. */}
            {m.nav.demo}
          </Link>

          {/* The burger, which appears exactly where the link row disappears —
              both key on `data-navburger`/`data-navlinks` in marketing.css, so
              the two can never both be hidden.

              No box around it any more. It used to be a bordered 38px square
              forced to 44 by the touch rule, standing beside a bordered
              sign-in and a filled call to action: three heavy rectangles in a
              row on a 320px bar, which is what the owner saw and called
              coarse. A menu control is the one thing on a bar that needs no
              outline — the glyph is the affordance — so the target stays 44px
              and the frame goes. The glyph grows 18 → 20 to hold its weight
              now that nothing else carries it. */}
          <button
            data-navburger
            type="button"
            aria-expanded={open}
            aria-label={m.nav.menu}
            onClick={() => setOpen((current) => !current)}
            className="text-fg hidden size-[38px] flex-none place-items-center rounded-md"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              {open ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
            </svg>
          </button>
        </div>

        {open ? (
          <nav
            data-sheet
            aria-label={m.nav.menu}
            className="bg-bg border-b shadow-lg"
            onClick={() => setOpen(false)}
          >
            <div data-wrap className="flex flex-col py-2">
              {links.map((item) => {
                const on = here === item.bare || here.startsWith(`${item.bare}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={on ? 'page' : undefined}
                    /* The same current-page answer the bar gives, in the form a
                       sheet can carry: a colour rather than an underline. A
                       reader who opened the menu to check where they are should
                       not have to close it again to find out. */
                    className={`border-divider flex h-13 items-center border-b text-[15px] font-semibold last:border-0 ${
                      on ? 'text-brand-600' : ''
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}

              {/*
               * The call to action, where the bar stops carrying it.
               *
               * On a phone the bar had a filled blue button in it at every
               * width, and the note that used to sit on that button said it
               * never leaves because it is what the page is for. It leaves
               * below 600 now, on the owner's call: three controls plus a
               * two-line wordmark is a bar nobody can read, and the page still
               * asks twice — here, at full width, and again in the band above
               * the footer of every page.
               */}
              <Link
                data-demosheet
                href={withLocale('/contact', locale)}
                className="bg-brand-500 mt-2 inline-flex h-12 items-center justify-center rounded-md text-[15px] font-semibold text-white"
              >
                {m.nav.demo}
              </Link>
            </div>
          </nav>
        ) : null}
      </header>

      <main>{children}</main>

      <CtaBand locale={locale} />
      <SiteFooter locale={locale} />
    </div>
  );
}

/**
 * The language on a phone, where three segments do not fit.
 *
 * Measured against the live bar: the segmented pill is 116px and the row it
 * would join wants 418 of the 292 a 320px screen has. It clears at 460px and
 * every phone in common use is narrower — 320, 360, 375, 390, 393, 412, 428.
 * So below 500 the same choice is drawn as one chip that opens, and above it
 * the pill stays exactly as the design draws it.
 *
 * A chip and not a squeezed pill, and not a button that cycles: three 30px
 * segments are a target nobody can hit, and a control that changes on tap
 * without saying what it will change to is a guess. This says what is on now,
 * a chevron says it opens, and what opens names the three languages in full
 * rather than in codes — there is room for the words here where the bar had
 * none.
 *
 * The panel is anchored to the chip's right edge so it opens inward from
 * wherever the chip has landed in the row, and never off the side of a phone.
 */
function LanguageChip({ locale, onPick }: { locale: Locale; onPick: (code: Locale) => void }) {
  const [open, setOpen] = useState(false);
  const current = LANGUAGE_OPTIONS.find((option) => option.code === locale) ?? LANGUAGE_OPTIONS[0];

  return (
    <div data-langchip className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={current.label}
        className="border-border bg-surface text-fg flex h-[34px] items-center gap-1 rounded-[9px] border pr-[6px] pl-[9px] text-xs font-semibold"
      >
        {current.short}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <>
          {/* A backdrop rather than a document listener: it closes on the same
              tap that would otherwise land on the page behind, which is what a
              reader dismissing a menu means to do. */}
          <button
            type="button"
            aria-label={current.label}
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-transparent"
          />
          <div
            role="menu"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false);
            }}
            className="border-border bg-surface absolute top-[calc(100%+7px)] right-0 z-50 flex min-w-[164px] flex-col gap-0.5 rounded-[12px] border p-1.5 shadow-lg"
          >
            {LANGUAGE_OPTIONS.map((option) => {
              const active = option.code === locale;

              return (
                <button
                  key={option.code}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  lang={option.code}
                  onClick={() => {
                    onPick(option.code);
                    setOpen(false);
                  }}
                  className={`flex h-11 items-center justify-between rounded-lg px-3 text-sm font-medium ${
                    active ? 'bg-bg-muted text-fg' : 'text-fg-muted'
                  }`}
                >
                  {option.label}
                  {active ? (
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="m5 13 4 4L19 7" />
                    </svg>
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Day and night in the bar — one glyph, on the preference side of the row.
 *
 * The design never drew this control for the marketing site, because it never
 * drew the site at night. The owner asked for both. The glyph says what
 * pressing does rather than which theme is on: the page already answers the
 * second question by being the colour it is.
 *
 * `system` is deliberately not reachable from here. A one-press control with
 * three states is a control that lands on the wrong one; the third choice
 * lives in the sheet, where it can be named. Pressing here from `system`
 * commits to the opposite of whatever the OS resolved to, which is what a
 * person pressing a sun at noon means.
 */
function ThemeSwitch({ label }: { label: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  return (
    <button
      data-themepill
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      aria-pressed={dark}
      className="text-fg-muted grid size-[34px] flex-none place-items-center rounded-[9px]"
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        aria-hidden
      >
        {dark ? (
          <path d="M12 4v2m0 12v2M4 12H2m20 0h-2M6.3 6.3 4.9 4.9m14.2 1.4 1.4-1.4M6.3 17.7l-1.4 1.4m14.2-1.4 1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
    </button>
  );
}

/**
 * The dark closing band — `Sayt v2.dc.html:886-911`.
 *
 * Global rather than per page, because the design's own condition is global:
 * `showCta: page !== "login" && page !== "contact"`. Six of the eight pages get
 * it, and the two that do not are the two that already ask for the reader's
 * details — a page that ends "request a demo" directly above the demo form is
 * the kind of thing that reads as a template rather than a page.
 *
 * It was missing entirely: the home page carried its own copy of roughly this
 * band as `#contact`, and the other five pages simply stopped, so a reader who
 * finished /pricing or /customers had nothing to press.
 */
function CtaBand({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const t = pagesCopy(locale).page;

  // The bare path: `usePathname()` says `/uz/contact`, and the two names this
  // compares against are the routes the app has, without a language on them.
  const here = splitLocale(pathname).bare;

  if (here === '/contact' || here === SIGN_IN_HREF) return null;

  return (
    <section className="bg-[var(--n-900)] py-[84px]">
      <div data-wrap>
        <div data-two className="grid grid-cols-[1fr_420px] items-center gap-14">
          {/* `min-w-0` — a grid item's automatic minimum is its min-content
              width, so this column would not go below the widest word in a
              42px heading. Measured at 320: the column was 309px inside a
              292px grid and the page scrolled sideways by three. */}
          <div className="min-w-0">
            <h2
              data-h2
              className="font-display m-0 text-[42px] leading-[1.12] font-bold tracking-[-.022em] text-balance text-white"
            >
              {t.ctaH}
            </h2>
            <p className="mt-4 max-w-[480px] text-[17px] leading-[1.6] text-pretty text-white/[.66]">
              {t.ctaP}
            </p>

            <div className="mt-[30px] flex flex-wrap gap-3">
              <Link
                data-btn-brand
                data-press
                href={withLocale('/contact', locale)}
                className="bg-brand-500 inline-flex h-12 items-center rounded-[12px] px-[22px] text-[15px] font-semibold text-white"
              >
                {t.ctaBtn1}
              </Link>
              <Link
                data-dark-btn
                data-press
                href={withLocale('/pricing', locale)}
                className="inline-flex h-12 items-center rounded-[12px] border border-white/[.16] bg-white/[.09] px-[22px] text-[15px] font-semibold text-white"
              >
                {t.ctaBtn2}
              </Link>
            </div>
          </div>

          <div className="min-w-0 rounded-[16px] border border-white/10 bg-white/5 p-[18px] sm:p-[26px]">
            <div className="tracking-caps text-xs font-semibold text-white/45 uppercase">
              {t.ctaCall}
            </div>
            <a
              href={CONTACT_TEL}
              data-num
              data-press
              className="font-display mt-2.5 block text-[24px] font-bold tracking-[-.02em] break-words text-white sm:text-[28px]"
            >
              {CONTACT.phone}
            </a>

            <div className="my-5 h-px bg-white/10" />

            <div className="grid gap-3">
              <CtaRow label="Telegram" value={CONTACT.telegram} href={CONTACT.telegramUrl} />
              <CtaRow label={t.ctaMail} value={CONTACT.email} href={`mailto:${CONTACT.email}`} />
              <CtaRow label={t.ctaHours} value={t.ctaHoursV} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CtaRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span className="text-[14px] text-white/[.62]">{label}</span>
      {href ? (
        <a
          href={href}
          data-press
          className="min-w-0 text-[14px] font-semibold break-all text-white"
        >
          {value}
        </a>
      ) : (
        <span className="min-w-0 text-[14px] font-semibold break-all text-white">{value}</span>
      )}
    </div>
  );
}

/**
 * Four columns — `Sayt v2.dc.html:913-939` and its `footCols` at 1095.
 *
 * The footer here was v1's: one row with a copyright, four links and a phone
 * number. v2 gives the site a real sitemap in the footer, which is the only
 * place on a marketing page where every route is reachable from every other
 * route — and the audit found the whole thing missing while its copy
 * (`fCompany`, `fProduct`, `fHelp`, `fBlurb`) was already sitting in
 * `pages-copy.ts`, transcribed and unused.
 *
 * Terms and Privacy were buttons for as long as neither document existed: a
 * press answered with a note saying the text was on its way, which is better
 * than a 404 but is still the wrong answer in the place a customer looks before
 * signing. Both are now routes, so they are links like everything else here.
 * `fTermsSoon` and `fPrivacySoon` stay in `pages-copy.ts` — three languages
 * deep, and removing a key from one of them is how the catalogues drift.
 */
function SiteFooter({ locale }: { locale: Locale }) {
  const t = pagesCopy(locale).page;

  const columns: readonly {
    title: string;
    links: readonly { label: string; href?: string; press?: () => void }[];
  }[] = [
    {
      title: t.fProduct,
      links: [
        { label: t.nProduct, href: withLocale('/product', locale) },
        { label: t.nRoles, href: withLocale('/roles', locale) },
        { label: t.nPricing, href: withLocale('/pricing', locale) },
        /*
         * The app download, in the footer and deliberately not in the header.
         *
         * `SITE_NAV` is six items because `Sayt v2.dc.html:1043-1045` lists
         * six, and `pages-fidelity.test.ts` holds it there — a seventh would
         * be a change to the design, not a link. The footer is the site's
         * sitemap and the right home for a route a reader looks for by name;
         * the page is also reached from the devices section of the home page,
         * which is where somebody is already thinking about phones.
         */
        { label: t.fDownload, href: withLocale('/download', locale) },
        { label: t.nLogin, href: withLocale(SIGN_IN_HREF, locale) },
      ],
    },
    {
      title: t.fCompany,
      links: [
        { label: t.nCustomers, href: withLocale('/customers', locale) },
        { label: t.nContact, href: withLocale('/contact', locale) },
        { label: t.fTerms, href: withLocale('/terms', locale) },
        { label: t.fPrivacy, href: withLocale('/privacy', locale) },
      ],
    },
    {
      title: t.fHelp,
      links: [
        { label: t.nFaq, href: withLocale('/faq', locale) },
        { label: t.fTelegram, href: CONTACT.telegramUrl },
        { label: t.fCall, href: CONTACT_TEL },
      ],
    },
  ];

  return (
    <footer className="border-t border-white/[.09] bg-[var(--n-900)] pt-[52px] pb-11">
      <div data-wrap>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-8">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-display text-2xs grid size-[26px] place-items-center rounded-[7px] bg-white/[.12] font-bold text-white">
                SR
              </span>
              <span className="font-display text-[15px] font-bold tracking-[-.02em] text-white">
                Smart Restaurant
              </span>
            </div>
            <p className="mt-3 max-w-[240px] text-[13px] leading-[1.6] text-white/50">{t.fBlurb}</p>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <div className="tracking-caps text-xs font-semibold text-white/40 uppercase">
                {column.title}
              </div>
              <div className="mt-3.5 grid justify-items-start gap-[9px]">
                {column.links.map((link) =>
                  link.href === undefined ? (
                    <button
                      key={link.label}
                      type="button"
                      data-footlink
                      onClick={link.press}
                      className="cursor-pointer border-0 bg-transparent p-0 text-left text-[14px] text-white/[.62]"
                    >
                      {link.label}
                    </button>
                  ) : link.href.startsWith('/') ? (
                    <Link
                      key={link.label}
                      data-footlink
                      href={link.href}
                      className="text-[14px] text-white/[.62]"
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      key={link.label}
                      data-footlink
                      href={link.href}
                      className="text-[14px] text-white/[.62]"
                    >
                      {link.label}
                    </a>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-white/[.09] pt-6">
          <span className="text-[13px] text-white/45">
            © 2026 Smart Restaurant Cloud · {t.fRights}
          </span>
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-white/45">
            {/* The build, beside the maker. A reader who reports something can
                say which version they were looking at, and a restaurant with
                two screens open can tell whether one of them is behind. Same
                constant the till reports when it pairs. */}
            <span data-num>v{APP_VERSION}</span>
            <span aria-hidden className="text-white/25">
              ·
            </span>
            <span>{t.fMade}</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
