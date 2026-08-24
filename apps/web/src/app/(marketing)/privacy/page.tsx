import type { Metadata } from 'next';
import { pageMeta } from '../page-meta';
import { localeAlternates } from '@/lib/locale-alternates';
import { pathLocale } from '@/lib/server-locale';

import { legalCopy } from '../legal-copy';
import { LegalDocument } from '../legal-document';

/**
 * `/privacy` — the privacy policy.
 *
 * Required rather than optional. The Law "On personal data" (ZRU-547) obliges
 * an operator to publish a document describing its processing policy, and
 * article 27¹ obliges it to hold Uzbek citizens' data on technical means inside
 * Uzbekistan — a claim that means nothing unless it is written down somewhere a
 * person can read it. This page is where the guest whose phone number is in a
 * restaurant's order history finds out who holds it and for how long.
 *
 * The two-layer answer in section 1 is the part worth getting right: for guest
 * and employee data the restaurant is the operator and the platform is the
 * processor; for the restaurant's own console accounts the platform is the
 * operator. Collapsing those two into one sentence is how a policy ends up
 * pointing every request at the wrong party.
 */
const base: Metadata = {
  title: { absolute: 'Maxfiylik siyosati — shaxsiy ma’lumotlar' },
  description:
    'Platforma qanday shaxsiy ma’lumotni yig’adi, nima uchun ishlatadi, kimga beradi va qancha vaqt saqlaydi. Ma’lumot O’zbekiston hududidagi serverlarda saqlanadi.',
  openGraph: {
    type: 'website',
    locale: 'uz_UZ',
    alternateLocale: ['ru_RU', 'en_US'],
    title: 'Maxfiylik siyosati — shaxsiy ma’lumotlar',
    description:
      'O’zR "Shaxsga doir ma’lumotlar to’g’risida"gi qonuniga muvofiq: qanday ma’lumot, qaysi maqsadda, qancha vaqt va kimga beriladi.',
  },
};

export default async function PrivacyPage() {
  // The same one segment the marketing layout reads — see the note on
  // `/terms` for what it replaced.
  const chosen = await pathLocale();

  return <LegalDocument doc={legalCopy(chosen).privacy} />;
}

/**
 * Per request, because the page has three addresses and each must name itself.
 *
 * A `metadata` constant cannot: it is evaluated once and would give `/uz/privacy`
 * and `/ru/privacy` the same canonical, which tells a crawler the Russian
 * copy is a duplicate of the Uzbek one and asks it not to index the page a
 * Russian reader is searching for. Everything that does not depend on the
 * language stays in `base` above.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await pathLocale();
  const { title, description } = pageMeta(locale, 'privacy');

  return {
    ...base,
    title,
    description,
    openGraph: { ...base.openGraph, title, description },
    alternates: await localeAlternates('/privacy'),
  };
}
