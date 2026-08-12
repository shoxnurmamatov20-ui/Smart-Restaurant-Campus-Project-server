import { redirect } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';

import { DEMO_ROLES_ENABLED } from '@/lib/role-cookie';
import { landingPath } from '@/lib/roles';
import { getSession } from '@/lib/session';

import '../(dashboard)/app-shell.css';
import { AccountMenu, LanguageAndTheme, RoleSwitcher } from '../(dashboard)/shell-client';

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
 * So: no sidebar, no branch switcher, no "new order". A header that names the
 * platform, the two preferences, and who is signed in.
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
  const t = await getTranslations('console.dashSuper');

  return (
    <NextIntlClientProvider messages={messages}>
      {/* Declares its own language — see the note in (dashboard)/layout.tsx. */}
      <div
        lang={locale}
        className="bg-bg-subtle text-fg text-md flex h-screen flex-col overflow-hidden"
      >
        <header className="bg-surface flex h-16 flex-none items-center gap-5 border-b pr-5 pl-6">
          <div className="flex min-w-0 flex-none items-center gap-3">
            <div className="bg-n-900 font-display grid size-7 flex-none place-items-center rounded-[8px] text-[14px] font-bold tracking-[-0.04em] text-white">
              SR
            </div>
            <div className="min-w-0">
              <div className="font-display text-md leading-[1.1] font-semibold tracking-[-0.03em]">
                Smart Restaurant Cloud
              </div>
              <div className="text-fg-subtle text-2xs mt-px tracking-wide">{t('greeting')}</div>
            </div>
          </div>

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

        <main data-scroll className="min-h-0 flex-1 px-8 pt-7 pb-12">
          <div className="mx-auto max-w-[1440px]">{children}</div>
        </main>
      </div>
    </NextIntlClientProvider>
  );
}
