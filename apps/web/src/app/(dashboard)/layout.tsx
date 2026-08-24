import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';

import { DEMO_ROLES_ENABLED } from '@/lib/role-cookie';
import { landingPath } from '@/lib/roles';
import { getSession } from '@/lib/session';

import './app-shell.css';
import { navFooterFor, navGroupsFor } from './nav';
import { notificationFeed } from './notifications-server';
import { shellState } from './shell-server';
import { DegradedNote } from './degraded-note';
import { OfflineStrip } from './offline-strip';
import { stripFrom } from './strip';
import { NavMenuButton, NavShell } from './nav-shell';
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
 * Built to the handoff's `files/Smart Restaurant OS.dc.html` — the 17 547-line
 * current export, not the 6 507-line v1 copy still sitting in
 * `docs/design/source/`, which names nineteen modules where the design has
 * twenty-four — at its own measurements: a 252px
 * sidebar over a surface, a 64px top bar carrying the screen's name, search,
 * notifications, branch, language, theme and the one action worth a filled
 * button, then a 44px status strip and a scrolling main. The page sits on
 * `bg-subtle` so every card reads as a raised surface against it — the design
 * separates by elevation and hairline rather than by tint, and getting that
 * background wrong is what makes an otherwise faithful screen look unfamiliar.
 *
 * `h-dvh overflow-hidden` with only `main` scrolling. A console is a
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
  /* The top bar's branch switcher and its bell, read once here rather than
     fetched by the controls themselves: a control in the header that loads
     after the page has painted is a control that moves under the pointer.
     Together, so the second read costs no extra round trip. */
  const [shell, bell] = await Promise.all([
    shellState(session.branchSlug, !session.branchPinned),
    notificationFeed(),
  ]);
  // The strip's four sentences, from the pulse — or the design's, for the
  // fixture console. See strip.ts for why a quiet kitchen still gets a chip.
  const strip = stripFrom(shell.pulse, t, locale, new Date());
  const groups = navGroupsFor(
    session.role,
    shell.pulse === null
      ? null
      : {
          orders: shell.pulse.orders_open,
          kitchen: shell.pulse.kitchen.open,
          inventory: shell.pulse.stock.low + shell.pulse.stock.out,
          cases: shell.pulse.cases_open,
        },
  );
  const footer = navFooterFor(session.role);
  const canOpenOrders = session.role.nav.includes('orders') || session.role.nav.includes('tables');

  /**
   * The three surfaces the strip switches between.
   *
   * It listed four and the fourth 404'd. `specs/01-os.md §2` names five
   * surfaces, but the manager phone is not one of them in the sense the others
   * are: the design file draws `backoffice`, `pos`, `kds` and `super`, and the
   * phone is the same back office at 390–430px — "read-mostly plus approvals"
   * is a description of what a manager does on a small screen, not of a screen.
   *
   * So there is nothing to link to, and this console is responsive down to
   * that width instead. The row that pointed at `/mobile` was the design being
   * read as a route list rather than a viewport list.
   */
  const surfaces = [
    { label: t('surfaceDesk'), href: null },
    { label: t('surfacePos'), href: '/pos' },
    { label: t('surfaceKds'), href: '/kitchen' },
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
      <div
        lang={locale}
        className="bg-bg-subtle text-fg text-md flex h-dvh flex-col overflow-hidden"
      >
        <OfflineStrip label={t('offline')} />

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/*
           * The connectivity strip, above everything.
           *
           * Full width and outside the shell's flex row, so it pushes the whole
           * console down rather than overlaying part of it — an overlay would
           * cover the row somebody was about to click.
           */}
          {/* ---- sidebar ---- */}
          <NavShell labels={{ collapse: t('collapse'), expand: t('expand') }}>
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

            {/* `min-h-0` beside `flex-1`: a column flex item will not shrink
                below its content without it, so the rail grew past the sidebar
                instead of scrolling inside it — and the rows, which had nothing
                holding their height, were squeezed from 40px down to 23. */}
            <nav data-scroll className="flex min-h-0 flex-1 flex-col gap-0.5 px-3 py-4">
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

            {/*
             * Settings, below a rule — `specs/01-os.md §3`.
             *
             * Outside the scrolling region on purpose: the design pins it to the
             * foot of the rail so it is in the same place whatever the role and
             * however long their list is. It used to be the last row of the
             * Business group, which put it under "Branches" for an owner and
             * under "Reports" for an accountant, and scrolled away on a short
             * screen.
             */}
            {footer === null ? null : (
              <div className="border-divider flex-none border-t px-3 py-3">
                <NavLink item={footer} />
              </div>
            )}
          </NavShell>

          {/* ---- main column ---- */}
          <div className="flex min-w-0 flex-1 flex-col">
            <header
              data-topbar
              className="bg-surface flex h-16 flex-none items-center gap-5 border-b pr-5 pl-6"
            >
              <div className="flex min-w-0 flex-none items-center gap-2.5">
                {/*
                 * The way back into the navigation below 820px, where the rail
                 * goes off-canvas. Above that width the stylesheet hides it — a
                 * button that opens something already on screen teaches people to
                 * ignore the header.
                 */}
                <NavMenuButton label={t('menu')} />
                <PageTitle />
              </div>

              <Search role={session.role} />

              <div className="ml-auto flex min-w-0 shrink items-center gap-3.5">
                <Notifications feed={bell} />
                <BranchSwitcher
                  branches={shell.branches}
                  activeSlug={shell.activeSlug}
                  canSwitch={shell.canSwitch}
                />
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
                  {strip.service}
                </span>
                <Divider optional="3" />

                <Chip tone="bg-success-500">{strip.tables}</Chip>
                <Divider optional="1" />

                <Chip tone={strip.kitchenBusy ? 'bg-warning-500' : 'bg-success-500'} optional="1">
                  {strip.kitchen}
                </Chip>
                <Divider optional="2" />

                <Chip tone={strip.stockShort ? 'bg-danger-500' : 'bg-success-500'} optional="2">
                  {strip.stock}
                </Chip>

                <Link href="/inventory" className="text-fg-brand text-xs font-medium">
                  {t('reviewStock')}
                </Link>
              </div>

              {/*
               * The surface switcher, demo only.
               *
               * `specs/01-os.md §2` says it in one line: "A surface switcher sits
               * in the status strip **for demonstration**. In production the
               * surface comes from terminal registration, not a control." It
               * shipped unconditionally, which meant a live console offered a
               * manager a link to the till and the kitchen wall — surfaces a real
               * deployment reaches by pairing a device, not by clicking.
               *
               * Gated on the same flag as the role switcher, and hidden the
               * moment a real session exists.
               */}
              {DEMO_ROLES_ENABLED && !session.live ? (
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
              ) : null}
            </div>

            <main data-scroll className="min-h-0 flex-1 px-8 pt-7 pb-12">
              <div className="mx-auto max-w-[1440px]">
                {/*
                 * The console shows fixtures whenever a read fails, which is the
                 * right behaviour — a screen that 500s because the API is
                 * restarting is worse than one showing sample numbers. What was
                 * wrong was doing it in silence: a reader saw invented figures
                 * presented as this morning's.
                 *
                 * Rendered above the page rather than inside each screen, because
                 * a render is degraded or it is not — one banner, not twelve
                 * copies of the same sentence in twelve modules.
                 */}
                <DegradedNote />
                {children}
              </div>
            </main>
          </div>
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
