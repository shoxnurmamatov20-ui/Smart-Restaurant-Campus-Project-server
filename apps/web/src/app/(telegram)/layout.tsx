import { pathLocale } from '@/lib/server-locale';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { guestLocale } from '../(guest)/guest-session';
import { TG } from '@restaurant/surfaces/tg/copy';
import { TG_BOT, type Lang } from '@restaurant/surfaces/tg/data';

import './tg.css';

/**
 * The mini app's shell.
 *
 * A phone-width column and nothing else. Telegram already draws a header, a
 * back button and a close button above this WebView, so a second header here
 * would be two of everything — and the design's screens are drawn without one
 * for exactly that reason.
 *
 * `noindex` throughout: these URLs only make sense inside a Telegram client
 * that has passed an `initData` signature, and a crawler reaching one would
 * index an empty basket.
 *
 * The runtime script Telegram injects (`telegram-web-app.js`) is deliberately
 * **not** loaded here. It is what gives `window.Telegram.WebApp` — the theme,
 * the main button, `initData` — and adding it before there is a server that can
 * verify the signature would produce a page that looks authenticated and is
 * not. The CSS falls back to the product's own tokens until then, so the
 * screens are usable and honest in a plain browser.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function TelegramLayout({ children }: { children: ReactNode }) {
  const lang = guestLocale(await pathLocale(), null) as Lang;

  return (
    /*
     * The accent is the *restaurant's*, not the platform's.
     *
     * `Telegram.dc.html:493-497` gives every tenant its own: Smart Restaurant
     * blue, Osh Xona terracotta, Choyxona Navruz tea green — one template,
     * forty-two bots, each recognisably its own. This surface is Osh Xona, so
     * `a1`; it had been hard-coded to the platform blue, which made every
     * restaurant's bot look like every other restaurant's bot.
     */
    <div data-tg data-acc={TG_BOT.accent} className="min-h-dvh">
      <div className="mx-auto w-full max-w-[480px]">
        {/*
         * Said once, at the top of every screen, rather than per board.
         *
         * It used to say the menu and the prices were samples too, and that
         * stopped being true: `tg/menu/page.tsx` reads
         * `GET /api/v1/public/menu` and the cart checks out through the same
         * `placeSiteOrder` the restaurant site uses. What is still a fixture is
         * everything that needs to know WHO is holding the phone — the points
         * balance and the tracked order — because that lives in Telegram's
         * signed `initData` and nothing on this platform verifies it against
         * the bot token yet. A balance shown before that would be somebody's.
         *
         * The menu says so for itself when the read did not answer
         * (`TG.sampleMenu`), which is the narrower and more useful claim.
         */}
        <p
          role="status"
          className="border-b border-[var(--tg-hint,var(--border))] bg-[var(--warning-50)] px-4 py-2 text-center text-[12px] leading-snug font-medium text-[var(--warning-700)]"
        >
          {TG.samplePoints[lang]}
        </p>

        {children}
      </div>
    </div>
  );
}
