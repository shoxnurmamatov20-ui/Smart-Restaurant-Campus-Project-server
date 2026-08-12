import type { Metadata } from 'next';

/**
 * The public site's metadata.
 *
 * A layout rather than the page itself because the page is a client component:
 * it holds the uz/ru/en switch the design puts in the header, and Next.js does
 * not read `metadata` out of a client module. The layout stays on the server,
 * so the head is still rendered at build time.
 *
 * Uzbek here on purpose. The switch is a reader's convenience; the canonical
 * document — the one a crawler and a shared link get — is the Uzbek one.
 */
export const metadata: Metadata = {
  title: 'Smart Restaurant Cloud — restoraningiz bitta ekranda',
  description:
    "Buyurtmadan hisobotgacha. Ofitsiant, oshpaz, kassir, omborchi va egasi — hammasi bitta tizimda, o'zbek tilida. 14 kun bepul sinov.",
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'uz_UZ',
    alternateLocale: ['ru_RU', 'en_US'],
    title: 'Smart Restaurant Cloud',
    description: 'Restoran, kafe va fast food uchun yagona raqamli platforma.',
  },
  robots: { index: true, follow: true },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
