import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';

/**
 * The platform's front door.
 *
 * One column on `bg-subtle` with the neutral mark above the card — the console
 * wears the neutral scale rather than the restaurant brand, and the door it
 * opens should look like the room behind it.
 *
 * `noindex` and no links out. This is a sign-in for the people who operate the
 * platform; there is nowhere else on this deployment for a visitor to go.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platform.signin');

  return {
    title: t('title'),
    robots: { index: false, follow: false },
  };
}

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages();
  const locale = await getLocale();

  return (
    <NextIntlClientProvider messages={messages}>
      {/* Declares its own language — see the note in (admin)/layout.tsx. */}
      <div
        lang={locale}
        className="bg-bg-subtle text-fg text-md flex min-h-screen flex-col items-center justify-center px-5 py-12"
      >
        <div className="mb-7 flex items-center gap-3">
          <span className="font-display grid size-9 flex-none place-items-center rounded-[10px] bg-[var(--n-900)] text-[15px] font-bold tracking-[-0.03em] text-white">
            SR
          </span>
          <span className="font-display text-lg leading-[1.1] font-semibold tracking-[-0.03em]">
            Smart Restaurant Cloud
          </span>
        </div>

        <div className="w-full max-w-[420px]">{children}</div>
      </div>
    </NextIntlClientProvider>
  );
}
