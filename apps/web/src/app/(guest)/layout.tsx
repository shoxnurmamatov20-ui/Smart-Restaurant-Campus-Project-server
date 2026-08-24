import type { ReactNode } from 'react';

import './guest.css';

/**
 * The surface a guest actually holds.
 *
 * No sidebar, no status strip, no sign-in — a phone that has just been pointed at
 * a QR code on a table. Everything the console layout provides is wrong here: the
 * reader has no account, no role and no reason to see a navigation tree.
 *
 * **No device frame.** `FOUNDATIONS §9` puts the breakpoint at 560 and calls
 * anything below it full-bleed; a bezel drawn around the content would be a
 * demo artefact shipped as a product, and on the one screen where the device IS
 * the frame. On a wide screen the column centres on `--page` instead, which reads
 * as a card on a field rather than a phone pretending to be a phone.
 *
 * The accent comes from `data-acc`, which is a setting a restaurant picks rather
 * than something derived from which restaurant it is — `FOUNDATIONS §1.4`. Two
 * venues of one chain may choose differently, and a rebrand is one value.
 */
export default function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <div data-guest className="bg-page text-fg min-h-dvh">
      {/*
       * `100dvh` and not `100vh`. Mobile Safari's `vh` is the viewport with the
       * address bar hidden, so a sticky basket pinned to `100vh` sits under the
       * bar for the whole first scroll — the one element a guest reaches for.
       */}
      <div className="mx-auto flex min-h-dvh w-full max-w-[var(--phone-measure)] flex-col">
        {children}
      </div>
    </div>
  );
}
