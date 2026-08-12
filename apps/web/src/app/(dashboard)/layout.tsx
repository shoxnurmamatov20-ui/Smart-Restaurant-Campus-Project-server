import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';

import { DEMO_ROLES_ENABLED } from '@/lib/role-cookie';
import { landingPath } from '@/lib/roles';
import { getSession } from '@/lib/session';

import './app-shell.css';
import { navGroupsFor } from './nav';
import {
  AccountMenu,
  BranchSwitcher,
  LanguageAndTheme,
  NavLink,
  Notifications,
  PageTitle,
  RoleSwitcher,
  Search,
} from './shell-client';

/**
 * The product shell.
 *
 * Built to `Smart Restaurant OS.dc.html` at its own measurements: a 252px
 * sidebar over a surface, a 64px top bar carrying the screen's name, search,
 * notifications, branch, language, theme and the one action worth a filled
 * button, then a 44px status strip and a scrolling main. The page sits on
 * `bg-subtle` so every card reads as a raised surface against it — the design
 * separates by elevation and hairline rather than by tint, and getting that
 * background wrong is what makes an otherwise faithful screen look unfamiliar.
 *
 * `h-screen overflow-hidden` with only `main` scrolling. A console is a
 * workspace, not a document: the nav and the status chips stay put while a
 * long order list moves underneath them.
 *
 * A server component that reads the language cookie through next-intl and hands
 * the catalogue down, so the console arrives in the reader's language on the
 * first paint rather than switching after hydration.
 *
 * Styling is Tailwind against the design's own tokens — `bg-surface`,
 * `text-fg-muted`, `text-sm` (13px), `rounded-md` (10px). Only the rules a
 * utility cannot express live in ./app-shell.css: data-attribute states, the
 * collapsing rail, scroll chrome and the design's breakpoints.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  /**
   * Two roles have no back office at all.
   *
   * The chef's screen is the wall display and the platform operator's is the
   * platform; neither has a sidebar to filter down to. Rendering this shell
   * empty for them would be a console with four blank section headings, so
   * they are sent to the surface they actually work on.
   */
  if (session.role.nav.length === 0) redirect(landingPath(session.role));

  const messages = await getMessages();
  const locale = await getLocale();
  const t = await getTranslations('console.shell');
  const nav = await getTranslations('console.nav');
  const groups = navGroupsFor(session.role);
  const canOpenOrders = session.role.nav.includes('orders') || session.role.nav.includes('tables');

  /** The four surfaces the strip switches between. */
  const surfaces = [
    { label: t('surfaceDesk'), href: null },
    { label: t('surfacePos'), href: '/pos' },
    { label: t('surfaceKds'), href: '/kitchen' },
    { label: t('surfacePhone'), href: '/mobile' },
  ];

  return (
    <NextIntlClientProvider messages={messages}>
      {/*
       * `lang` here rather than on <html>.
       *
       * The document root is Uzbek and static — that is the canonical page a
       * crawler and a shared link get, and reading the cookie up there would
       * make the marketing site render per request for a preference. The
       * console is behind a session and already renders per request, so it
       * declares its own language on its own subtree, which is what a screen
       * reader honours: the innermost `lang` wins. Without this a Russian
       * console is announced with Uzbek pronunciation rules.
       */}
      <div lang={locale} className="bg-bg-subtle text-fg text-md flex h-screen overflow-hidden">
        {/* ---- sidebar ---- */}
        <aside data-nav className="bg-surface flex flex-none flex-col overflow-hidden border-r">
          <div className="border-divider flex h-[60px] flex-none items-center gap-3 border-b px-5">
            <div className="bg-brand-500 font-display grid size-7 flex-none place-items-center rounded-[8px] text-[14px] font-bold tracking-[-0.04em] text-white">
              SR
            </div>
            <div data-navlabel className="min-w-0">
              <div className="font-display text-md leading-[1.1] font-semibold tracking-[-0.03em]">
                Smart Restaurant
              </div>
              <div className="text-fg-subtle text-2xs mt-px tracking-wide">{t('tagline')}</div>
            </div>
          </div>

          <nav data-scroll className="flex flex-1 flex-col gap-0.5 px-3 py-4">
            {groups.map((group) => (
              <div key={group.key} className="contents">
                <div
                  data-navsection
                  className="text-fg-subtle text-2xs tracking-caps px-2.5 pt-[18px] pb-1.5 font-semibold uppercase transition-opacity first:pt-2"
                >
                  {nav(group.key)}
                </div>

                {group.items.map((item) => (
                  <NavLink key={item.key} item={item} />
                ))}
              </div>
            ))}
          </nav>
        </aside>

        {/* ---- main column ---- */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            data-topbar
            className="bg-surface flex h-16 flex-none items-center gap-5 border-b pr-5 pl-6"
          >
            <div className="min-w-0 flex-none">
              <PageTitle />
            </div>

            <Search />

            <div className="ml-auto flex min-w-0 shrink items-center gap-3.5">
              <Notifications />
              <BranchSwitcher />
              <LanguageAndTheme />

              {/* The one filled button on the screen, and only for the roles
                  whose day starts with an order. An accountant offered "new
                  order" is being offered a screen they cannot open. */}
              {canOpenOrders ? (
                <Link
                  data-cta
                  href={session.role.nav.includes('orders') ? '/orders' : '/pos'}
                  title={t('newOrder')}
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
                  <span data-cta-label>{t('newOrder')}</span>
                </Link>
              ) : null}

              <span aria-hidden className="bg-divider -mx-0.5 h-[26px] w-px flex-none" />

              {/* Hidden once a real session exists: the switcher writes the role
                  cookie, and a real session reads the role from the API, so it
                  would appear to do nothing. A dev affordance for the fixture
                  console, not a way to change who you are. */}
              {DEMO_ROLES_ENABLED && !session.live ? (
                <RoleSwitcher current={session.role.id} />
              ) : null}

              <AccountMenu
                name={session.user.name}
                initials={session.user.initials}
                roleId={session.role.id}
                nav={session.role.nav}
              />
            </div>
          </header>

          {/* Status strip: what is true right now, non-scrolling. */}
          <div className="bg-surface flex h-11 flex-none border-b">
            <div data-strip className="flex min-w-0 flex-1 items-center gap-3.5 pr-5 pl-6">
              <span data-strip-opt="3" className="text-fg-subtle text-xs">
                {t('serviceOpen')}
              </span>
              <Divider optional="3" />

              <Chip tone="bg-success-500">{t('tablesSeated')}</Chip>
              <Divider optional="1" />

              <Chip tone="bg-warning-500" optional="1">
                {t('kitchenLoad')}
              </Chip>
              <Divider optional="2" />

              <Chip tone="bg-danger-500" optional="2">
                {t('lowStock')}
              </Chip>

              <Link href="/inventory" className="text-fg-brand text-xs font-medium">
                {t('reviewStock')}
              </Link>
            </div>

            <div
              data-striptail
              className="bg-surface border-divider flex flex-none items-center gap-3 border-l pr-6 pl-5"
            >
              <span data-strip-opt="2" className="text-fg-subtle text-xs">
                {t('openOn')}
              </span>

              <div className="bg-bg-muted flex items-center gap-0.5 rounded-sm p-0.5">
                {surfaces.map((surface, index) =>
                  surface.href ? (
                    <Link
                      key={surface.label}
                      href={surface.href}
                      data-seg
                      className="text-fg-muted text-2xs grid h-6 place-items-center rounded-[5px] px-2.5 font-semibold"
                    >
                      {surface.label}
                    </Link>
                  ) : (
                    <span
                      key={surface.label}
                      data-seg
                      data-active={index === 0 ? 'true' : undefined}
                      className="text-fg-muted text-2xs grid h-6 place-items-center rounded-[5px] px-2.5 font-semibold"
                    >
                      {surface.label}
                    </span>
                  ),
                )}
              </div>
            </div>
          </div>

          <main data-scroll className="min-h-0 flex-1 px-8 pt-7 pb-12">
            <div className="mx-auto max-w-[1440px]">{children}</div>
          </main>
        </div>
      </div>
    </NextIntlClientProvider>
  );
}

function Divider({ optional }: { optional?: string }) {
  return <span data-strip-opt={optional} aria-hidden className="bg-divider h-3.5 w-px" />;
}

function Chip({
  tone,
  optional,
  children,
}: {
  tone: string;
  optional?: string;
  children: React.ReactNode;
}) {
  return (
    <span data-strip-opt={optional} className="text-fg-muted flex items-center gap-[7px] text-xs">
      <span aria-hidden className={`rounded-pill size-1.5 flex-none ${tone}`} />
      {children}
    </span>
  );
}
