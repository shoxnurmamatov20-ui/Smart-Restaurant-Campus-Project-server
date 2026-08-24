import type { ReactNode } from 'react';

import type { Metadata } from 'next';

import { InstallPrompt } from '@/components/install-prompt';

import './crew.css';

/**
 * The staff app's shell.
 *
 * A phone-width column on a field, and nothing else. **No device frame.** The
 * design file draws a 390×812 bezel with a fake 11:24 clock and battery glyphs
 * so a reviewer can see the whole app on one page; `FOUNDATIONS §9` puts the
 * breakpoint at 560 and calls everything under it full-bleed, and `START-HERE
 * §3` says the demo affordances come out. A bezel drawn around content that is
 * already on a phone would be a review board shipped as a product.
 *
 * Above 560 the column centres on `--page` — a role rather than a colour: in
 * light it matches `--bg-muted`, in dark it goes deliberately darker than
 * `--bg-subtle`, so the column reads as a card floating on a field rather than
 * a panel welded to the background. `bg-page` — the token *is* mapped into
 * Tailwind's `--color-*` namespace (`tokens.css`, `@theme inline`), and this
 * file's note that it was not is what the arbitrary-value escape hatch beside
 * it was working around.
 *
 * No `data-acc`. The accent axis is a restaurant's own colour on guest-facing
 * surfaces; the staff app takes the design system's brand blue unchanged, so a
 * waiter who works two venues of one chain does not have to relearn which
 * colour means "ready".
 */
/**
 * The staff app's own manifest.
 *
 * It had none, so it inherited the platform's — which starts at `/dashboard`.
 * A waiter who added this to their home screen from the tab bar opened the
 * back-office console instead of their tables.
 */
export const metadata: Metadata = {
  manifest: '/manifest-crew.json',
};

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <div data-crew className="bg-page text-fg min-h-dvh">
      {/*
       * `100dvh`, never `100vh`. Mobile Safari measures `vh` against the
       * viewport with the address bar hidden, so the dock — the control this
       * whole app is navigated by — sits underneath that bar for the entire
       * first scroll.
       */}
      <div className="mx-auto flex min-h-dvh w-full max-w-[var(--phone-measure)] flex-col">
        {children}
      </div>

      {/*
        Offered once, well into a shift.

        An employee opens this every working day, which is the strongest case for
        installing anything on this platform — and the worst possible moment to
        ask is the first screen, before they have signed in. On iOS the component
        draws the Share → Add to Home Screen steps, because Safari fires no
        install event at all.
      */}
      <InstallPrompt surface="crew" lang="uz" delayMs={240_000} />
    </div>
  );
}
