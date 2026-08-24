import type { Metadata } from 'next';
import { pathLocale } from '@/lib/server-locale';
import { pageMeta } from '../page-meta';
import { localeAlternates } from '@/lib/locale-alternates';

import { siteUrl } from '@/lib/site-url';

import { DownloadBoard } from './download-board';
import { readAppManifest } from './download-server';

/**
 * `/download` — where the native app is handed out.
 *
 * The head lives here and the screen lives in `download-board.tsx`, the same
 * split every other page under `(marketing)` uses: Next reads `metadata` out of
 * server modules only, and the board needs `useLocale` and the clipboard.
 *
 * This file is also the only place on the site that reads the filesystem, which
 * is why the server half is a module of its own — `download-server.ts` imports
 * `node:fs` and must never be reachable from the browser bundle.
 */

/**
 * Rendered per request, and this page has its own reason for it.
 *
 * The APK is published by `srcp-apk`, which is not part of a web deploy: the
 * manifest can change ten minutes after a release and will change again without
 * one. A statically rendered page would freeze whichever manifest existed when
 * `next build` ran — on a build host, that is usually none at all — and go on
 * announcing it. The marketing layout happens to read a cookie, which already
 * forces this, but that is the layout's decision and could be revisited; this
 * one is ours.
 */
export const dynamic = 'force-dynamic';

const TITLE = 'Ilovani yuklab olish — Android va iPhone';
const DESCRIPTION =
  'Smart Restaurant ilovasini to’g’ridan-to’g’ri saytdan yuklab oling — Play Market orqali emas. Bitta Android faylida to’rtta yuza, versiya, hajm va SHA-256 bilan. iPhone uchun sayt bosh ekranga ilova bo’lib o’rnatiladi.';

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
  /*
   * Indexed, stated rather than inherited.
   *
   * The layout already says so for the whole marketing site, but this is the
   * one page here that hands out a binary, and "a download page should surely
   * be noindex" is a plausible-sounding change somebody makes later. It is the
   * opposite: an owner who searches for the app by name has to land here rather
   * than on a store that does not list it. `robots.ts` leaves `/download` open
   * — `download.test.ts` checks that it stays open.
   */
  robots: { index: true, follow: true },
};

export default function DownloadPage() {
  /*
   * Read on the server, off this host's disk. Never fetched from our own site:
   * see `download-server.ts` for why a self-request is the wrong shape here.
   */
  const manifest = readAppManifest();

  /*
   * The absolute address, for the "open it on your phone" block. `siteUrl()`
   * is server-only on purpose — `SITE_URL` is deliberately not a
   * `NEXT_PUBLIC_` value, so the host is never baked into a browser bundle —
   * which means it has to be resolved here and passed down.
   */
  const pageUrl = new URL('/download', siteUrl()).toString();

  return <DownloadBoard manifest={manifest} pageUrl={pageUrl} />;
}

/**
 * Per request, because the page has three addresses and each must name itself.
 *
 * A `metadata` constant cannot: it is evaluated once and would give `/uz/download`
 * and `/ru/download` the same canonical, which tells a crawler the Russian
 * copy is a duplicate of the Uzbek one and asks it not to index the page a
 * Russian reader is searching for. Everything that does not depend on the
 * language stays in `base` above.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await pathLocale();
  const { title, description } = pageMeta(locale, 'download');

  return {
    ...base,
    title,
    description,
    openGraph: { ...base.openGraph, title, description },
    alternates: await localeAlternates('/download'),
  };
}
