import { redirect } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

import { canSee, landingPath } from '@/lib/roles';
import { getSession } from '@/lib/session';

import '../(dashboard)/app-shell.css';

/**
 * The kitchen wall, on its own surface.
 *
 * `specs/01-os.md §2` lists five surfaces and this is one of them: **1920×1080,
 * read at two to three metres, dark by default, no hover.** It used to render
 * inside the back-office shell — a 252px sidebar, a 64px top bar, a status
 * strip and a 1440px measure — which cost the board a third of a wall screen
 * and put a branch switcher and a language menu in a kitchen.
 *
 * Two consequences follow and both are the point:
 *
 *   **A fixed frame.** `h-dvh` with `overflow-hidden`, so the header and the
 *   station tabs stay put and only the columns scroll. In the shell the flex
 *   chain was broken and the whole page scrolled, taking the tabs off the top
 *   of the screen the moment a busy service filled a column.
 *
 *   **Dark, whatever the console's theme.** A kitchen is lit brightly and a
 *   white board glares; the design fixes this surface dark and the console's
 *   own preference does not reach it.
 *
 * Still guarded. The chef holds one row and it is this one, so the same check
 * the console runs applies — a waiter who types the URL is sent to their own
 * screen rather than shown the pass.
 */
export default async function KdsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!canSee(session.role, 'kitchen')) redirect(landingPath(session.role));

  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);

  return (
    <NextIntlClientProvider messages={messages}>
      {/*
       * `data-theme="dark"` on the subtree rather than on the document: the
       * console keeps whatever the reader chose, and this one screen does not.
       */}
      <div
        lang={locale}
        data-theme="dark"
        className="bg-bg-subtle text-fg flex h-dvh flex-col overflow-hidden"
      >
        {children}
      </div>
    </NextIntlClientProvider>
  );
}
