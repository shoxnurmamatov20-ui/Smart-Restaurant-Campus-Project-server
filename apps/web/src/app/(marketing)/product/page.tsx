import type { Metadata } from 'next';
import { pathLocale } from '@/lib/server-locale';
import { pageMeta } from '../page-meta';
import { localeAlternates } from '@/lib/locale-alternates';

import { ProductBoard } from './product-board';

/**
 * `/product` — its own title, description and canonical.
 *
 * All six sub-pages were `'use client'` with no metadata of their own, so Next
 * fell back to the layout's: every one of them told a crawler it was the home
 * page, with the home page's title, the home page's description and
 * `canonical: '/'`. Six URLs declaring themselves duplicates of a seventh is
 * how a site ends up with one page in the index instead of seven.
 *
 * The fix is the split below, not a `generateMetadata` inside a client module —
 * Next reads metadata out of server modules only. This file owns the head;
 * `product-board.tsx` keeps the state the design's screen needs.
 */
const base: Metadata = {
  title: { absolute: 'Mahsulot — restoranning har bir bo’limi uchun' },
  description:
    'Zal, oshxona, kassa, ombor, moliya va ko’p filial — oltita modul, har biri o’z ekrani bilan. Fiskal modul, Didox, Click, Payme va 1C ulangan holda keladi.',
  openGraph: {
    type: 'website',
    locale: 'uz_UZ',
    alternateLocale: ['ru_RU', 'en_US'],
    title: 'Mahsulot — restoranning har bir bo’limi uchun',
    description:
      'Zal, oshxona, kassa, ombor, moliya va ko’p filial — oltita modul, har biri o’z ekrani bilan. Fiskal modul, Didox, Click, Payme va 1C ulangan holda keladi.',
  },
};

export default function ProductPage() {
  return <ProductBoard />;
}

/**
 * Per request, because the page has three addresses and each must name itself.
 *
 * A `metadata` constant cannot: it is evaluated once and would give `/uz/product`
 * and `/ru/product` the same canonical, which tells a crawler the Russian
 * copy is a duplicate of the Uzbek one and asks it not to index the page a
 * Russian reader is searching for. Everything that does not depend on the
 * language stays in `base` above.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await pathLocale();
  const { title, description } = pageMeta(locale, 'product');

  return {
    ...base,
    title,
    description,
    openGraph: { ...base.openGraph, title, description },
    alternates: await localeAlternates('/product'),
  };
}
