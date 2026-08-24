import type { Metadata } from 'next';
import { pageMeta } from './page-meta';
import { localeAlternates } from '@/lib/locale-alternates';
import { NextIntlClientProvider } from 'next-intl';

import { messages as catalogues, type Locale } from '@/i18n';
import { pathLocale } from '@/lib/server-locale';

import { asScriptJson } from '../(site)/venue-schema';
import { platformGraph } from './marketing-schema';
import { SiteChrome } from './site-chrome';

import './marketing.css';

/**
 * The home page's metadata, and the fallback for anything under this layout.
 *
 * A layout rather than the page itself because the home page is a client
 * component: it reads the catalogue through `useLocale`, and Next.js does not
 * read `metadata` out of a client module. The layout stays on the server, so
 * the head is still rendered at build time — and it is also where the language
 * cookie is read, so every page under it gets the reader's choice without
 * asking for it.
 *
 * **This describes `/` only.** It used to describe all seven pages, because the
 * six sub-routes were client components with nothing of their own and inherited
 * every field below, `canonical: '/'` included — seven URLs each claiming to be
 * the home page. Each of them now has its own `page.tsx` beside its board, and
 * what is left here is the home page's own head plus the two fields worth
 * sharing (`robots`, and the language declaration).
 *
 * Uzbek here on purpose. The switch is a reader's convenience; the canonical
 * document — the one a crawler and a shared link get — is the Uzbek one.
 */
const base: Metadata = {
  title: { absolute: 'Smart Restaurant Cloud — restoraningiz bitta ekranda' },
  description:
    "Buyurtmadan hisobotgacha. Ofitsiant, oshpaz, kassir, omborchi va egasi — hammasi bitta tizimda, o'zbek tilida. 14 kun bepul sinov.",
  openGraph: {
    type: 'website',
    locale: 'uz_UZ',
    alternateLocale: ['ru_RU', 'en_US'],
    title: 'Smart Restaurant Cloud',
    description: 'Restoran, kafe va fast food uchun yagona raqamli platforma.',
  },
  robots: { index: true, follow: true },
};

/**
 * The home page's own head, per request.
 *
 * The note this replaces called it right and then drew the wrong conclusion:
 * "Uzbek here on purpose. The switch is a reader's convenience; the canonical
 * document — the one a crawler and a shared link get — is the Uzbek one." That
 * was true when there was one URL. There are three now, and a crawler that
 * fetches `/ru` and is told the canonical is `/uz` files the Russian home page
 * as a duplicate of the Uzbek one.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await pathLocale();
  const { title, description } = pageMeta(locale, 'home');

  return {
    ...base,
    title: { absolute: title },
    description,
    openGraph: { ...base.openGraph, title, description },
    alternates: await localeAlternates('/'),
  };
}

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  /*
   * The reader's language, chosen once and kept.
   *
   * The switch used to be `useState` in the one-page site — which worked only
   * because there was nowhere to navigate to. Now that the design's other six
   * pages are real routes, the choice has to outlive a navigation, so it rides
   * in a cookie the server reads here and hands to the provider.
   */
  /*
   * From the path, not from a cookie.
   *
   * `srcp.site.lang` used to decide this, and it was the second of four places
   * the platform kept a language — which is exactly how a reader who chose
   * Russian here got Uzbek back on the restaurant page they clicked through
   * to. The choice is in the URL now and `pathLocale()` reads the one segment
   * the middleware stripped off.
   */
  const locale: Locale = (await pathLocale()) as Locale;

  return (
    <>
      {/*
       * Who makes this and what it is — every page on the site, because it
       * describes the platform rather than the document.
       *
       * `FAQPage` used to be emitted here too, which put a description of six
       * questions into the head of all seven pages, including the six that do
       * not ask them. It now lives on `/faq`, next to the questions it
       * describes, so the markup and the page cannot drift apart again.
       */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: asScriptJson(platformGraph()) }}
      />
      <NextIntlClientProvider locale={locale} messages={catalogues[locale]}>
        <SiteChrome locale={locale}>{children}</SiteChrome>
      </NextIntlClientProvider>
    </>
  );
}
