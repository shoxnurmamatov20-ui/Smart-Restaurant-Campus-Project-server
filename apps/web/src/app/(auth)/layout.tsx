import type { Metadata } from 'next';
import Link from 'next/link';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';

/**
 * The front door.
 *
 * One narrow column on `bg-subtle` with the brand mark above the card, at the
 * 460px the design gives the sign-in panel in its own section. Nothing else:
 * a person arriving here is either signing in or resetting a password, and a
 * marketing header would only offer them somewhere else to go.
 *
 * A server component so the page arrives in the reader's language on the first
 * paint. That costs the route its prerender — reading the cookie makes it
 * dynamic — and it is the right trade here: a sign-in page is not indexed, and
 * a Russian speaker seeing an Uzbek form flash first is a worse first
 * impression than a per-request render.
 *
 * `noindex` for the same reason. These three routes carry no content worth
 * ranking, and letting them into the index only spends crawl budget that
 * belongs to the marketing site.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketing.signin');

  return {
    title: t('pageTitle'),
    robots: { index: false, follow: false },
  };
}

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages();
  const locale = await getLocale();
  const t = await getTranslations('marketing.signin');

  return (
    <NextIntlClientProvider messages={messages}>
      {/* Declares its own language — see the note in (dashboard)/layout.tsx. */}
      <div
        lang={locale}
        className="bg-bg-subtle text-fg text-md flex min-h-screen flex-col items-center justify-center px-5 py-12"
      >
        <Link href="/" className="mb-7 flex items-center gap-3">
          <span className="bg-brand-500 font-display grid size-9 flex-none place-items-center rounded-[10px] text-[17px] font-bold tracking-[-0.04em] text-white">
            SR
          </span>
          <span className="font-display text-lg leading-[1.1] font-semibold tracking-[-0.03em]">
            Smart Restaurant
          </span>
        </Link>

        <div className="w-full max-w-[460px]">{children}</div>

        <Link href="/" className="text-fg-subtle hover:text-fg mt-7 text-sm font-medium">
          {t('backToSite')}
        </Link>
      </div>
    </NextIntlClientProvider>
  );
}
