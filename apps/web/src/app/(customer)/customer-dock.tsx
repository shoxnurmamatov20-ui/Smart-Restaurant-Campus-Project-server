'use client';

import Link from 'next/link';
import { useLocalePath } from '@/lib/use-locale-path';

import { copy, DOCK } from '@restaurant/surfaces/customer/copy';
import type { Lang } from '@restaurant/surfaces/customer/data';

/**
 * The four-slot dock the whole app is navigated by.
 *
 * Four, from the design file — Menu, Cart, Order, Profile. The spec text says
 * five; the file wins, which is the package's own rule ("where a document and a
 * file disagree, the file wins and the document is a bug").
 *
 * Fixed to the bottom rather than the top because this is a phone held in one
 * hand: the reachable third of a 390×844 screen is the bottom, and the dock is
 * pressed more than anything else here.
 *
 * The safe-area inset is inside `--cx-dock`, so every screen can reserve exactly
 * the right amount of scroll room with one variable instead of each one guessing.
 * That only returns a real number because the root viewport sets
 * `viewportFit: 'cover'`; without it iOS answers 0 and the dock sits under the
 * home indicator on every iPhone, silently.
 */
export function CustomerDock({ lang, cartCount = 0 }: { lang: Lang; cartCount?: number }) {
  // `here` is the path without its language; `to()` puts it back on a href.
  const { here, to } = useLocalePath();
  const t = copy(DOCK, lang);

  const slots = [
    { href: '/customer', label: t.menu, icon: '☰' },
    { href: '/customer/cart', label: t.cart, icon: '▤', badge: cartCount },
    { href: '/customer/order', label: t.order, icon: '◷' },
    { href: '/customer/profile', label: t.profile, icon: '◕' },
  ];

  return (
    <nav
      aria-label={t.menu}
      className="border-border bg-surface sticky bottom-0 z-30 flex flex-none border-t"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {slots.map((slot) => {
        /*
         * Exact match for the root, prefix for the rest.
         *
         * `/customer` is the menu and `/customer/cart` is not a menu screen — a
         * plain `startsWith` would light both slots at once and leave a guest
         * unsure which tab they are on.
         */
        const active =
          slot.href === '/customer' ? here === '/customer' : here.startsWith(slot.href);

        return (
          <Link
            key={slot.href}
            href={to(slot.href)}
            aria-current={active ? 'page' : undefined}
            className={`relative flex min-h-[var(--tap-min)] flex-1 flex-col items-center justify-center gap-0.5 py-2 ${
              active ? 'text-acc' : 'text-fg-subtle'
            }`}
          >
            <span aria-hidden className="text-lg leading-none">
              {slot.icon}
            </span>
            <span className="text-2xs font-semibold">{slot.label}</span>

            {/*
             * The basket count, which is the one number on this bar that changes.
             * Hidden at zero rather than shown as `0`: an empty badge trains a
             * reader to stop looking at it.
             */}
            {slot.badge !== undefined && slot.badge > 0 ? (
              <span
                data-num
                className="bg-acc text-2xs rounded-pill absolute top-1 right-[22%] grid h-4 min-w-4 place-items-center px-1 font-bold text-white"
              >
                {slot.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
