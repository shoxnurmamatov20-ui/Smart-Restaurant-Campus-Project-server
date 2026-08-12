import Link from 'next/link';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';

import { formatNumber } from '@restaurant/utils';

import './admin-shell.css';
import { EXTRA_NAV, PLATFORM_NAV, SETTINGS_ITEM } from './nav';
import { PLATFORM, TEAM, initials } from './platform-data';
import { LanguageAndTheme, NavLink, PageTitle } from './shell-client';

/**
 * The platform console's shell.
 *
 * Built to the design's super-admin frame: a 252px rail on a surface, a 60px
 * brand block, 40px rows on a 10px radius, and a 64px top bar over a scrolling
 * main. The same measurements as the restaurant console, so the two read as one
 * product.
 *
 * What differs is the brand. This console wears the neutral scale rather than
 * the product's blue (see globals.css), because it is the window where somebody
 * suspends a restaurant, and it should never be mistaken for the window where
 * somebody takes an order.
 *
 * The page scrolls inside `main`, not on the document. A rail that scrolls away
 * with the content is a rail you have to scroll back up to use.
 *
 * A server component that reads the language cookie through next-intl and hands
 * the catalogue down, so the console arrives in the reader's language on the
 * first paint rather than switching after hydration.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages();
  const locale = await getLocale();
  const t = await getTranslations('platform.shell');
  const nav = await getTranslations('platform.nav');

  const operator = TEAM[0]!;

  return (
    <NextIntlClientProvider messages={messages}>
      {/* Declares its own language: the document root is static Uzbek, and a
          console rendered in Russian must say so or a screen reader reads it
          with Uzbek pronunciation rules. */}
      <div lang={locale} className="bg-bg-subtle text-fg text-md flex h-screen">
        <aside data-nav className="bg-surface flex flex-none flex-col overflow-hidden border-r">
          <div className="border-divider flex h-[60px] flex-none items-center gap-3 border-b px-5">
            <div className="font-display grid size-7 flex-none place-items-center rounded-[8px] bg-[var(--n-900)] text-[12px] font-bold tracking-[-0.03em] text-white">
              SR
            </div>
            <div data-navlabel className="min-w-0">
              <Link
                href="/dashboard"
                className="font-display text-md block leading-[1.1] font-semibold tracking-[-0.03em] whitespace-nowrap"
              >
                {t('title')}
              </Link>
              <p className="text-fg-subtle text-2xs mt-px whitespace-nowrap">{t('product')}</p>
            </div>
          </div>

          <nav data-scroll className="flex flex-1 flex-col gap-0.5 px-3 py-4">
            {PLATFORM_NAV.map((item) => (
              <NavLink key={item.href} item={item} label={nav(item.key)} />
            ))}

            {/*
              This platform's own screens, which the handoff never drew. Kept
              behind a heading rather than mixed into the design's list, so the
              rail stays an honest map of both.
            */}
            <div
              data-navsection
              className="text-fg-subtle text-2xs tracking-caps px-2.5 pt-[18px] pb-1.5 font-semibold uppercase"
            >
              {t('extra')}
            </div>

            {EXTRA_NAV.map((item) => (
              <NavLink key={item.href} item={item} label={nav(item.key)} />
            ))}
          </nav>

          <div className="border-divider flex-none border-t p-3">
            <NavLink item={SETTINGS_ITEM} label={nav(SETTINGS_ITEM.key)} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header
            data-topbar
            className="bg-surface flex h-16 flex-none items-center gap-5 border-b pr-5 pl-6"
          >
            <PageTitle />

            <span data-rolelabel data-num className="text-fg-subtle text-xs whitespace-nowrap">
              {t('product')} · {formatNumber(PLATFORM.restaurants)} /{' '}
              {formatNumber(PLATFORM.branches)}
            </span>

            <div className="ml-auto flex min-w-0 flex-[0_1_auto] items-center gap-3.5">
              <LanguageAndTheme />

              <span aria-hidden className="bg-divider -mx-0.5 h-[26px] w-px flex-none" />

              <Link
                href="/tenants/new"
                data-cta
                className="bg-brand-500 hover:bg-brand-600 flex h-9 flex-none items-center gap-2 rounded-md px-3.5 text-sm font-semibold text-white"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  className="flex-none"
                  aria-hidden
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span data-cta-label>{t('newTenant')}</span>
              </Link>

              <Link
                href="/team"
                className="hover:bg-bg-muted flex h-[42px] flex-none items-center gap-2.5 rounded-md pr-2 pl-[5px]"
              >
                <span className="grid size-8 flex-none place-items-center rounded-full bg-[var(--n-900)] text-xs font-semibold text-white">
                  {initials(operator.name)}
                </span>
                <span data-rolelabel className="text-left">
                  <span className="block text-sm leading-[1.15] font-semibold">
                    {operator.name}
                  </span>
                  <span className="text-fg-subtle text-2xs mt-px block">{t('title')}</span>
                </span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-fg-subtle flex-none"
                  aria-hidden
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </Link>
            </div>
          </header>

          <main data-scroll className="min-h-0 flex-1 px-8 pt-7 pb-12">
            <div className="mx-auto max-w-[1440px]">{children}</div>
          </main>
        </div>
      </div>
    </NextIntlClientProvider>
  );
}
