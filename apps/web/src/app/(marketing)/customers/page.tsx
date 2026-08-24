import type { Metadata } from 'next';
import { pathLocale } from '@/lib/server-locale';
import { pageMeta } from '../page-meta';
import { localeAlternates } from '@/lib/locale-alternates';

import { CustomersBoard } from './customers-board';

/**
 * `/customers` — its own title, description and canonical.
 *
 * All six sub-pages were `'use client'` with no metadata of their own, so Next
 * fell back to the layout's: every one of them told a crawler it was the home
 * page, with the home page's title, the home page's description and
 * `canonical: '/'`. Six URLs declaring themselves duplicates of a seventh is
 * how a site ends up with one page in the index instead of seven.
 *
 * The fix is the split below, not a `generateMetadata` inside a client module —
 * Next reads metadata out of server modules only. This file owns the head;
 * `customers-board.tsx` keeps the state the design's screen needs.
 */
/*
 * The head says scenarios, because the page does.
 *
 * It used to promise "Mijozlar" and name five cities — a search snippet
 * claiming customers in Tashkent, Samarkand, Bukhara, Termez and Fergana for a
 * platform that has none yet. A snippet is read by more people than the page,
 * and it is the half a reader remembers.
 */
const TITLE = 'Stsenariylar — raqamlar bilan aytilgan uchta holat';
const DESCRIPTION =
  'Har bir stsenariyda nima muammo bo’lgani, nima o’zgargani va natija qanday o’lchanishi yozilgan. Tizimning o’z hisobotlari asosidagi namunaviy holatlar.';

const base: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    locale: 'uz_UZ',
    alternateLocale: ['ru_RU', 'en_US'],
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function CustomersPage() {
  return <CustomersBoard />;
}

/**
 * Per request, because the page has three addresses and each must name itself.
 *
 * A `metadata` constant cannot: it is evaluated once and would give `/uz/customers`
 * and `/ru/customers` the same canonical, which tells a crawler the Russian
 * copy is a duplicate of the Uzbek one and asks it not to index the page a
 * Russian reader is searching for. Everything that does not depend on the
 * language stays in `base` above.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await pathLocale();
  const { title, description } = pageMeta(locale, 'customers');

  return {
    ...base,
    title,
    description,
    openGraph: { ...base.openGraph, title, description },
    alternates: await localeAlternates('/customers'),
  };
}
