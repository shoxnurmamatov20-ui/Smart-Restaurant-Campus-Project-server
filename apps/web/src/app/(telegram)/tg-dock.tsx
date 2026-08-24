'use client';

import Link from 'next/link';
import { useLocalePath } from '@/lib/use-locale-path';

import { cartCount, useCart } from '@/lib/guest-cart';

import { t } from '@restaurant/surfaces/tg/copy';
import type { Lang } from '@restaurant/surfaces/tg/data';

/**
 * The four mini-app screens, as a bottom dock.
 *
 * Telegram's own chrome is at the top, so navigation goes to the bottom where
 * a thumb is. Four is the whole mini app — menu, cart, order, points — and the
 * count on the cart is the only badge, because it is the only one that changes
 * while somebody is looking at another tab.
 *
 * The chat (`/tg`) and the notifications preview (`/tg/push`) are deliberately
 * **not** tabs: they are the stages either side of the mini app, reached
 * through the app bar's close control and the bot's own messages. Putting them
 * here would make a six-slot dock out of a design that draws four.
 */
const TABS = [
  { key: 'tabMenu' as const, href: '/tg/menu' },
  { key: 'tabCart' as const, href: '/tg/cart' },
  { key: 'tabOrder' as const, href: '/tg/order' },
  { key: 'tabPoints' as const, href: '/tg/points' },
];

export function TgDock({ lang, basket }: { lang: Lang; basket: string }) {
  // `here` is the path without its language; `to()` puts it back on a href.
  const { here, to } = useLocalePath();
  const cart = useCart(basket);
  const count = cartCount(cart);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-[480px] justify-around border-t"
      style={{
        background: 'var(--tg-card)',
        borderColor: 'var(--border)',
        /* Telegram's WebView is a full-height sheet on iOS, so the home
           indicator is the mini app's problem rather than Telegram's — without
           the inset the four tab labels sit in the strip it draws over. */
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {TABS.map((tab) => {
        const active = here.startsWith(tab.href);

        return (
          <Link
            key={tab.key}
            href={to(tab.href)}
            data-tap
            data-press
            aria-current={active ? 'page' : undefined}
            className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold"
            style={{ color: active ? 'var(--tg-link)' : 'var(--tg-hint)' }}
          >
            {t(tab.key, lang)}

            {tab.key === 'tabCart' && count > 0 ? (
              <span
                data-num
                className="absolute top-1 right-[22%] grid size-4 place-items-center rounded-full text-[9px] font-bold text-white"
                style={{ background: 'var(--acc)' }}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
