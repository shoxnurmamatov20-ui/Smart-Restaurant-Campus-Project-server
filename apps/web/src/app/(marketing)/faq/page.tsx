import type { Metadata } from 'next';
import { pathLocale } from '@/lib/server-locale';
import { pageMeta } from '../page-meta';
import { localeAlternates } from '@/lib/locale-alternates';

import { asScriptJson } from '../../(site)/venue-schema';
import { faqPage } from '../marketing-schema';
import { FaqBoard } from './faq-board';

/**
 * `/faq` — its own title, description and canonical.
 *
 * All six sub-pages were `'use client'` with no metadata of their own, so Next
 * fell back to the layout's: every one of them told a crawler it was the home
 * page, with the home page's title, the home page's description and
 * `canonical: '/'`. Six URLs declaring themselves duplicates of a seventh is
 * how a site ends up with one page in the index instead of seven.
 *
 * The fix is the split below, not a `generateMetadata` inside a client module —
 * Next reads metadata out of server modules only. This file owns the head;
 * `faq-board.tsx` keeps the state the design's screen needs.
 */
const base: Metadata = {
  title: { absolute: 'Savollar — ko’p so’raladigan savollar' },
  description:
    'Ishga tushirish, kundalik ish, xavfsizlik va narx bo’yicha o’nta savol va javob. Javobini topmadingizmi? Qo’ng’iroq qiling — o’sha kuni javob beramiz.',
  openGraph: {
    type: 'website',
    locale: 'uz_UZ',
    alternateLocale: ['ru_RU', 'en_US'],
    title: 'Savollar — ko’p so’raladigan savollar',
    description:
      'Ishga tushirish, kundalik ish, xavfsizlik va narx bo’yicha o’nta savol va javob. Javobini topmadingizmi? Qo’ng’iroq qiling — o’sha kuni javob beramiz.',
  },
};

export default function FaqPage() {
  return (
    <>
      {/*
       * `FAQPage`, on the page that asks the questions.
       *
       * It used to be emitted from the marketing layout, which put a
       * description of six questions into the head of all seven routes — and
       * kept describing those six after the design moved the FAQ here and grew
       * it to ten. Markup describing an answer a reader cannot see is a manual
       * action, not a missed opportunity, so the markup lives beside the list
       * it describes and reads the same array.
       */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: asScriptJson(faqPage()) }}
      />
      <FaqBoard />
    </>
  );
}

/**
 * Per request, because the page has three addresses and each must name itself.
 *
 * A `metadata` constant cannot: it is evaluated once and would give `/uz/faq`
 * and `/ru/faq` the same canonical, which tells a crawler the Russian
 * copy is a duplicate of the Uzbek one and asks it not to index the page a
 * Russian reader is searching for. Everything that does not depend on the
 * language stays in `base` above.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await pathLocale();
  const { title, description } = pageMeta(locale, 'faq');

  return {
    ...base,
    title,
    description,
    openGraph: { ...base.openGraph, title, description },
    alternates: await localeAlternates('/faq'),
  };
}
