'use client';

import Link from 'next/link';
import { useLocalePath } from '@/lib/use-locale-path';
import { useState } from 'react';

import { flash } from '@restaurant/ui';

import { cartCount, useCart } from '@/lib/guest-cart';

import { AddressSheet } from './mp-modals';
import { useChosenAddress } from './mp-address';
import { t } from '@restaurant/surfaces/mp/copy';
import type { Lang } from '@restaurant/surfaces/mp/data';

/**
 * The header on a desktop and the dock on a phone — one component, one truth.
 *
 * The design draws a website and an app and they navigate differently; what
 * they do not differ on is *where* the four destinations are. Building both off
 * one list is what keeps a route added to one from being missing in the other,
 * which is the failure mode of a product drawn twice.
 *
 * Three things live up here because the design puts them there and because
 * they are true of every screen rather than one: **the mode** (delivery or
 * pickup, which changes what is charged), **the address** (which changes what
 * can be delivered at all), and **the search**. The search is passed in rather
 * than owned here — the results are the home board's list, and a header that
 * kept its own query would be a second source of truth for what the page is
 * showing.
 */
const TABS = [
  { key: 'home' as const, href: '/mp' },
  { key: 'cart' as const, href: '/mp/cart' },
  { key: 'track' as const, href: '/mp/track' },
  { key: 'orders' as const, href: '/mp/orders' },
  { key: 'profile' as const, href: '/mp/profile' },
];

export function MpChrome({
  lang,
  basket,
  search,
}: {
  lang: Lang;
  basket: string;
  /** Only the home board passes this — it is the one screen with a list. */
  search?: { value: string; onChange: (next: string) => void };
}) {
  // `here` is the path without its language; `to()` puts it back on a href.
  const { here, to } = useLocalePath();
  const cart = useCart(basket);
  const count = cartCount(cart);

  const [mode, setMode] = useState<'delivery' | 'pickup'>('delivery');
  const [addressOpen, setAddressOpen] = useState(false);
  const address = useChosenAddress();

  const active = (href: string) => (href === '/mp' ? here === '/mp' : here.startsWith(href));

  return (
    <>
      <header
        data-mp-nav
        className="bg-surface sticky top-0 z-40 min-h-16 flex-wrap items-center gap-3.5 border-b px-6 py-2.5"
      >
        <Link href={to('/mp')} className="font-display flex-none text-lg font-bold tracking-tight">
          {t('brand', lang)}
        </Link>

        {/* Delivery or pickup. It is a segmented control rather than a toggle
            because the two are not on/off — pickup charges nothing and shows a
            different time, and a switch cannot say that. */}
        <div className="bg-bg-muted flex flex-none gap-0.5 rounded-[10px] p-[3px]">
          {(['delivery', 'pickup'] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={mode === key}
              onClick={() => {
                setMode(key);
                flash(t(key === 'delivery' ? 'modeDeliv' : 'modePick', lang));
              }}
              className={`h-[30px] rounded-lg px-[15px] text-[13px] font-semibold ${
                mode === key ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted'
              }`}
            >
              {t(key === 'delivery' ? 'delivery' : 'pickup', lang)}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setAddressOpen(true)}
          className="border-border bg-surface flex h-[38px] flex-none items-center gap-2 rounded-[10px] border px-3 text-[13px]"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--fg-subtle)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="2.6" />
          </svg>
          <span className="max-w-[180px] truncate">{address ?? t('addrPick', lang)}</span>
          <span className="text-fg-subtle" aria-hidden>
            ·
          </span>
          <span className="text-fg-muted">{t('whenNow', lang)}</span>
        </button>

        {search === undefined ? null : (
          <div className="relative min-w-[200px] flex-1">
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--fg-subtle)"
              strokeWidth="1.9"
              strokeLinecap="round"
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m16.5 16.5 4 4" />
            </svg>

            <input
              type="search"
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              placeholder={t('search', lang)}
              aria-label={t('search', lang)}
              className="rounded-pill border-border bg-bg-muted h-10 w-full border pr-11 pl-10 text-sm"
            />

            {search.value.trim() === '' ? null : (
              <button
                type="button"
                onClick={() => search.onChange('')}
                title={t('clearQ', lang)}
                aria-label={t('clearQ', lang)}
                className="bg-border text-fg-muted absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-full text-[15px] leading-none"
              >
                ×
              </button>
            )}
          </div>
        )}

        <nav className="ml-auto flex items-center gap-5">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={to(tab.href)}
              className={`text-sm font-semibold ${active(tab.href) ? '' : 'text-fg-muted'}`}
            >
              {t(tab.key, lang)}
              {tab.key === 'cart' && count > 0 ? (
                <span data-num className="text-brand-600 ml-1.5">
                  {count}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
      </header>

      <nav
        data-mp-dock
        className="bg-surface fixed inset-x-0 bottom-0 z-40 justify-around border-t"
        style={{
          /* The home indicator sits in the bottom 34px of every modern iPhone,
             and a dock pinned to `bottom-0` puts its labels underneath it. The
             pages already reserve `pb-24` for the dock itself; this is the strip
             below the dock, whose height only the inset knows. */
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={to(tab.href)}
            data-tap
            aria-current={active(tab.href) ? 'page' : undefined}
            className={`relative flex flex-1 flex-col items-center justify-center py-2 text-[11px] font-semibold ${
              active(tab.href) ? 'text-brand-600' : 'text-fg-muted'
            }`}
          >
            {t(tab.key, lang)}

            {tab.key === 'cart' && count > 0 ? (
              <span
                data-num
                className="bg-brand-500 absolute top-1 right-[26%] grid size-4 place-items-center rounded-full text-[9px] font-bold text-white"
              >
                {count}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      {addressOpen ? <AddressSheet lang={lang} onClose={() => setAddressOpen(false)} /> : null}
    </>
  );
}
