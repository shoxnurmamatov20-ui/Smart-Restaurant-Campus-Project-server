import type { Metadata, Viewport } from 'next';
import { Inter, Inter_Tight, JetBrains_Mono } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

/*
 * The design's three families.
 *
 * Inter for the interface, Inter Tight for headlines and any number above
 * 24px, JetBrains Mono for ids, invoice numbers and timers. The handoff names
 * SF Pro as the intended target and these as the open-licence stand-ins, so a
 * team holding an SF Pro licence swaps the families here and changes nothing
 * else.
 *
 * Cyrillic is in the subset because the interface ships in Russian as well as
 * Uzbek, and a missing subset is a page that silently falls back to a system
 * font for every Russian string.
 */
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
});

const interTight = Inter_Tight({
  variable: '--font-inter-tight',
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700', '800'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Smart Restaurant Campus — Restoran boshqaruv platformasi',
    template: '%s · Restaurant Campus',
  },
  description:
    'Restoran, kafe va oshxonalar uchun yagona raqamli platforma: menyu, buyurtma, oshxona, ombor, kassa va analitika',
  applicationName: 'Smart Restaurant Campus',
  authors: [{ name: 'Smart Restaurant Campus Team' }],
  keywords: [
    'Restaurant Campus',
    'Smart Restaurant',
    'Restoran',
    'POS',
    'KDS',
    'Menyu',
    "O'zbekiston",
  ],
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/icon-192.png',
  },
  openGraph: {
    type: 'website',
    locale: 'uz_UZ',
    title: 'Smart Restaurant Campus',
    description: 'Restoranlar uchun yagona raqamli boshqaruv platformasi',
    siteName: 'Smart Restaurant Campus',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="uz"
      suppressHydrationWarning
      className={`${inter.variable} ${interTight.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
