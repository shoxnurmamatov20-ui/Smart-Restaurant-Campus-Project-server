import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

import '../(dashboard)/app-shell.css';

/**
 * The till's own shell.
 *
 * A separate route group from `(dashboard)` on purpose: the design gives the
 * POS no sidebar, no status strip and no 1440px measure — it is a tablet held
 * in one hand, not a desk. Sharing the console's layout would mean fighting it
 * off on every screen.
 *
 * It borrows app-shell.css for the data-attribute states and the scroll chrome,
 * which are the same on both surfaces, and the same catalogue so the language
 * follows the reader across.
 */
export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages();
  const locale = await getLocale();

  return (
    <NextIntlClientProvider messages={messages}>
      {/*
       * Declares its own language — see the note in (dashboard)/layout.tsx.
       * `contents` because the till's pages expect to be the layout's only box:
       * the element carries the attribute and takes no part in the layout.
       */}
      <div lang={locale} className="contents">
        {children}
      </div>
    </NextIntlClientProvider>
  );
}
