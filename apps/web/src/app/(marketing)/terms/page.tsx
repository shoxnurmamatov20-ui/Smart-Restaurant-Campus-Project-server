import type { Metadata } from 'next';
import { pageMeta } from '../page-meta';
import { localeAlternates } from '@/lib/locale-alternates';
import { pathLocale } from '@/lib/server-locale';

import { legalCopy } from '../legal-copy';
import { LegalDocument } from '../legal-document';

/**
 * `/terms` — the public offer.
 *
 * The footer has linked to this page since the site was built, and until now
 * the link answered with a toast saying the document was on its way. That is
 * not a missing page: a platform that invoices restaurants has to publish the
 * terms it invoices them under, and "coming soon" in the place where the terms
 * belong is the answer that stops a real customer from signing.
 *
 * Indexable on purpose. `robots.ts` guards the back office and the guest
 * surfaces and leaves everything else open, which is right here — a buyer
 * searching for our terms before a meeting should find them, and so should a
 * regulator.
 */
const base: Metadata = {
  title: { absolute: 'Ommaviy oferta — foydalanish shartlari' },
  description:
    'Smart Restaurant Cloud platformasidan foydalanish shartlari: tarif va to’lov, ma’lumotlar egaligi va eksport, xizmat mavjudligi, javobgarlik chegarasi, fiskallashtirish va nizolarni hal qilish tartibi.',
  openGraph: {
    type: 'website',
    locale: 'uz_UZ',
    alternateLocale: ['ru_RU', 'en_US'],
    title: 'Ommaviy oferta — foydalanish shartlari',
    description:
      'O’zR Fuqarolik kodeksining 367–369-moddalari ma’nosidagi ommaviy oferta: tariflar, ma’lumotlar egaligi, mavjudlik va javobgarlik.',
  },
};

export default async function TermsPage() {
  /*
   * The reader's language, read the way the marketing layout reads it.
   *
   * From the path, and the note this replaces is worth keeping as history: it
   * explained that the public site kept its *own* cookie, separate from the
   * console's, because a guest switching the site to Russian is not the same
   * act as a manager switching the console. That was true and it was still the
   * bug — two memories of one question, and a reader who crossed between the
   * two surfaces got whichever had been written last.
   *
   * There is one answer now and it is in the URL, which is also the only form
   * of it that can be linked to. `/ru/terms` is the Russian terms, to a
   * reader, to a crawler and to whoever they send it to.
   */
  const chosen = await pathLocale();

  return <LegalDocument doc={legalCopy(chosen).terms} />;
}

/**
 * Per request, because the page has three addresses and each must name itself.
 *
 * A `metadata` constant cannot: it is evaluated once and would give `/uz/terms`
 * and `/ru/terms` the same canonical, which tells a crawler the Russian
 * copy is a duplicate of the Uzbek one and asks it not to index the page a
 * Russian reader is searching for. Everything that does not depend on the
 * language stays in `base` above.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await pathLocale();
  const { title, description } = pageMeta(locale, 'terms');

  return {
    ...base,
    title,
    description,
    openGraph: { ...base.openGraph, title, description },
    alternates: await localeAlternates('/terms'),
  };
}
