import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin', 'cyrillic'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'CAMPUS — Yagona Raqamli Ekotizim',
    template: '%s · CAMPUS',
  },
  description: 'Universitet boshqaruvi va ta\'lim jarayonlarini to\'liq raqamlashtirish platformasi',
  applicationName: 'CAMPUS',
  authors: [{ name: 'CAMPUS Team' }],
  keywords: ['CAMPUS', 'Smart Campus', 'Universitet', 'HEMIS', 'O\'zbekiston', 'Ta\'lim'],
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/icon-192.png',
  },
  openGraph: {
    type: 'website',
    locale: 'uz_UZ',
    title: 'CAMPUS — Smart Campus Platform',
    description: 'Universitetning yagona raqamli ekotizimi',
    siteName: 'CAMPUS',
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
