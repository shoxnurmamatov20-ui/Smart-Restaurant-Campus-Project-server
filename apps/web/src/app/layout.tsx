import { headers } from 'next/headers';
import type { Metadata, Viewport } from 'next';
import { Inter, Inter_Tight, JetBrains_Mono } from 'next/font/google';
import { Providers } from '@/components/providers';
import { ServiceWorker } from '@/components/service-worker';
import { siteUrl } from '@/lib/site-url';
import { DOC_LANG_HEADER } from '@/middleware';
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
  /*
   * Every relative URL Next emits into <head> is resolved against this: the
   * openGraph image, the canonical link, the alternates. Without it Next warns
   * at build time and falls back to localhost, which is how a production page
   * ends up telling Facebook its preview image lives on the developer's laptop.
   *
   * Read from SITE_URL rather than written down, because this deployment
   * answers on a different host than the one the project was named for, and a
   * baked-in host is a bug that only shows up on the deployment nobody tested.
   * See lib/site-url.ts for why it is not the NEXT_PUBLIC_ form.
   */
  metadataBase: new URL(siteUrl()),
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
  /**
   * Standalone on iOS, which reads none of the manifest.
   *
   * `Smart Restaurant Sayt va PWA.dc.html` names this as the platform's first
   * limitation: Safari shows no install banner and — less visibly — ignores
   * `display: standalone` in a web manifest entirely. Without these two tags a
   * guest who follows the instructions and adds the app to their home screen
   * still opens it inside Safari, address bar and all, which looks exactly like
   * having installed nothing.
   *
   * `black-translucent` rather than `default` because `viewportFit: 'cover'`
   * below already lets the page reach under the notch: any other value paints
   * an opaque bar over the top of a layout that expected to own that space.
   */
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Smart Restaurant',
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
  /*
   * The browser chrome matches the page canvas: `--bg` in FOUNDATIONS §1.2 and
   * §1.3. Dark was `#0a0a0a`, a neutral black the design never uses — its dark
   * canvas is `#0B0E16`, the blue-black the whole dark ramp is built on, and a
   * status bar a shade off it reads as a seam across the top of every dark
   * screen.
   */
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0E16' },
  ],
  width: 'device-width',
  initialScale: 1,
  /*
   * Lets the page reach under the notch and the home indicator — and, far more
   * importantly, makes `env(safe-area-inset-*)` return a real number.
   *
   * Without it iOS Safari answers 0 for every inset, silently. Every phone-width
   * surface in this app ends in a sticky bar — the guest's basket, the customer
   * app's dock, the staff app's tab bar — and each one is written correctly
   * against `env(safe-area-inset-bottom)`. All three would still sit under the
   * home-indicator line, and nothing in a test or a desktop browser would show
   * it: the inset only exists on the device.
   *
   * One word, three surfaces, and the kind of bug that is found by a person
   * holding a phone rather than by anything we run.
   */
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  /*
   * Read here and nowhere else, so exactly one element carries the language.
   *
   * `headers()` makes this layout — and therefore every page under it —
   * dynamic. That is a real cost and it is the right trade: the only route
   * that was statically rendered is `/design`, a component gallery with no
   * reader, while the pages that matter were already `force-dynamic` because
   * they read a session or a tenant. Correct language on a public page is
   * worth more than a prerendered gallery.
   *
   * Falls back to the raw `Accept-Language` for the one path middleware does
   * not run on — the marketing root, which its matcher excludes.
   */
  const heading = await headers();
  const lang =
    heading.get(DOC_LANG_HEADER) ??
    ((heading.get('accept-language') ?? '').split(',')[0]?.slice(0, 2).toLowerCase() || 'uz');
  return (
    <html
      /*
       * The reader's language, not the platform's.
       *
       * Hard-coded `"uz"` until now, which was wrong on the two surfaces built
       * to be read in three: a Russian page announcing Uzbek tells a screen
       * reader to pronounce it with the wrong phonetics, and tells a crawler
       * the page is in a language it is not. On `/r/[restaurant]` — the one
       * surface strangers arrive at from a search — that is the difference
       * between ranking for a Russian query and being invisible to it.
       */
      lang={lang}
      suppressHydrationWarning
      className={`${inter.variable} ${interTight.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <Providers>{children}</Providers>
        {/*
         * Registered from the body rather than the head, and only in
         * production. Its whole job on this platform is the install prompt and
         * the offline page — it stores no HTML and never touches `/api/`.
         * See public/sw.js for why it is that narrow.
         */}
        <ServiceWorker />
      </body>
    </html>
  );
}
