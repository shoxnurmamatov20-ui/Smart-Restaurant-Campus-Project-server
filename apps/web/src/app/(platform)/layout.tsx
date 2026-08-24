import { redirect } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';

import { DEMO_ROLES_ENABLED } from '@/lib/role-cookie';
import { landingPath } from '@/lib/roles';
import { getSession } from '@/lib/session';

import '../(dashboard)/app-shell.css';
/*
 * After the console's stylesheet, and every rule in it prefixed with
 * `[data-platform]`. The layout still needs `app-shell.css` for the collapsing
 * rail and the drawer; this one carries the surface the platform console alone
 * wears, and out-specifies rather than fights it.
 */
import './platform.css';
import { AccountMenu, LanguageAndTheme, RoleSwitcher } from '../(dashboard)/shell-client';
import { PLATFORM_NAV } from './platform-nav';
import { PlatformRail } from './platform-rail';
import { NavMenuButton, PlatformShell } from './platform-shell';

/**
 * The platform operator's shell.
 *
 * Deliberately not the restaurant console. A super admin is not a very
 * privileged owner — they are a different kind of user entirely, working across
 * forty-two tenants and never inside one, and giving them the same sidebar
 * would invite exactly the confusion the design warns about: an operator who
 * thinks they are looking at *a* restaurant's numbers when they are looking at
 * everyone's.
 *
 * So: their own sidebar, and no branch switcher and no "new order" — those
 * belong to a restaurant and this role never stands inside one.
 *
 * The sidebar is the correction. `specs/01-os.md §6` opens with "12 screens,
 * own navigation, own sidebar", and this layout used to argue that a super
 * admin should have no rail at all. The premise was right and the conclusion
 * was not: what they must not get is the *restaurant's* rail.
 *
 * The role switcher is here for the same reason it is in the back office, and
 * one more: this role has no sidebar, so in a demo build it is the only way
 * back out.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  // The guard in middleware.ts already turns everyone else away. This is the
  // second lock on the same door: a redirect here costs nothing and means a
  // matcher edited badly cannot quietly open the platform to a branch manager.
  if (session.role.surface !== 'super') redirect(landingPath(session.role));

  const messages = await getMessages();
  const locale = await getLocale();
  const [t, nav, shell] = await Promise.all([
    getTranslations('console.dashSuper'),
    getTranslations('console.platformNav'),
    getTranslations('console.shell'),
  ]);

  const railLabels: Record<string, string> = {
    ...Object.fromEntries(PLATFORM_NAV.map((group) => [`group_${group.key}`, nav(group.key)])),
    ...Object.fromEntries(
      PLATFORM_NAV.flatMap((group) => group.items).map((item) => [item.key, nav(item.key)]),
    ),
  };

  return (
    <NextIntlClientProvider messages={messages}>
      {/* Declares its own language — see the note in (dashboard)/layout.tsx. */}
      <div
        lang={locale}
        data-platform
        className="bg-bg-subtle text-fg text-md flex h-dvh overflow-hidden"
      >
        <PlatformShell>
          <div className="flex h-16 flex-none items-center gap-3 border-b px-5">
            <div className="bg-n-900 font-display grid size-7 flex-none place-items-center rounded-[8px] text-[14px] font-bold tracking-[-0.04em] text-white">
              SR
            </div>
            <div className="min-w-0">
              <div className="font-display text-md leading-[1.1] font-semibold tracking-[-0.03em]">
                Smart Restaurant
              </div>
              <div className="text-fg-subtle text-2xs mt-px tracking-wide">{t('greeting')}</div>
            </div>
          </div>

          <PlatformRail labels={railLabels} />
        </PlatformShell>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header
            data-topbar
            className="bg-surface flex h-16 flex-none items-center gap-3 border-b pr-5 pl-6 lg:gap-5"
          >
            <NavMenuButton label={shell('menu')} />

            <div className="ml-auto flex min-w-0 shrink items-center gap-3.5">
              <LanguageAndTheme />

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

          {/* More air than the restaurant console, and deliberately so: that
              one is a working surface somebody stands at all shift, this one is
              read a screen at a time between phone calls. */}
          <main data-scroll className="min-h-0 flex-1 px-5 pt-7 pb-16 sm:px-8 sm:pt-9">
            <div className="mx-auto max-w-[1440px]">{children}</div>
          </main>
        </div>
      </div>
    </NextIntlClientProvider>
  );
}
