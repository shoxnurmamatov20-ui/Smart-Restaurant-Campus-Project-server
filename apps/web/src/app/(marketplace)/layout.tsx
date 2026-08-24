import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { InstallPrompt } from '@/components/install-prompt';

import './mp.css';
/* The consumer side sets `data-demo` on two screens; the rules live with the
   merchant panel that set it first, and one definition is the point. */
import '../(merchant)/data-demo.css';

/**
 * The marketplace shell.
 *
 * `noindex` for now, and that is temporary rather than principled: a consumer
 * marketplace is the one surface on this platform that *should* be crawled —
 * eight restaurants' menus under one roof is exactly what a search engine is
 * for. It stays out of the index until there is a backend behind it, because
 * indexing fixtures publishes prices no restaurant agreed to.
 */
export const metadata: Metadata = {
  title: 'MyPOS',
  /*
   * Its own manifest, so an installed MyPOS opens on the store list rather than
   * on the staff console. The platform manifest starts at `/dashboard`, which
   * is what a guest who added this to their home screen used to get.
   */
  manifest: '/manifest-mp.json',
  robots: { index: false, follow: false },
};

export default function MarketplaceLayout({ children }: { children: ReactNode }) {
  return (
    <div data-mp data-acc="a0" className="min-h-dvh">
      {children}

      {/*
        The ask, after two minutes rather than on arrival.
        `Sayt va PWA.dc.html` makes the case — no store commission, thirty-second
        publishing, ~1.4 MB — and names the catch: on iOS nothing prompts, so the
        component draws the Share → Add to Home Screen steps instead.
      */}
      <InstallPrompt surface="mp" lang="uz" delayMs={120_000} />
    </div>
  );
}
