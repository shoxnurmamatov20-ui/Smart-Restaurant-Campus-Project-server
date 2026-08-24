'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { flash, NavMenuButton } from '@restaurant/ui';

import { post } from '@/lib/console-post';

import { merchantCopy } from './merchant-copy';
import { MERCHANT_TITLES, NOT_SAVED, say, TRADING, type Lang } from './merchant-data';
import { MerchantLocale } from './merchant-locale';

/**
 * The panel's sticky header — `Do'kon paneli.dc.html:125-155`.
 *
 * It holds two things the rail cannot: **what this screen is** (a 20px title
 * over a 12px line, both of which change per view and both of which the design
 * writes out), and **whether the store is trading**.
 *
 * The trading toggle moved here from the rail because that is where the design
 * puts it and because the reason is the same one the rail's own comment gave:
 * it is the control a merchant reaches for when the fryer dies, and the header
 * is on screen on every view while the rail scrolls.
 *
 * The title comes off the pathname rather than a prop, so a new merchant route
 * gets its heading by adding one entry to `MERCHANT_TITLES` instead of
 * remembering to pass it — which is how five of these ended up with the wrong
 * heading before, including a disputes screen titled "Ochiq nizo yo‘q".
 */
/** Two letters for the shop's mark, from whatever the restaurant is called. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '··';
}

export function MerchantHeader({ lang, shop }: { lang: Lang; shop: string | null }) {
  const pathname = usePathname();
  const t = merchantCopy(lang);
  const [open, setOpen] = useState(true);

  const view = pathname.split('/')[2] ?? 'orders';
  const heading = MERCHANT_TITLES[view] ?? MERCHANT_TITLES.orders!;
  const trading = open ? TRADING.open : TRADING.closed;

  return (
    <header data-topbar data-mtopbar className="bg-surface sticky top-0 z-50 flex-none border-b">
      <div className="mx-auto flex min-h-16 max-w-[1320px] flex-wrap items-center gap-3.5 px-4 py-2.5 sm:px-8">
        <NavMenuButton label={t.text.navMenu} />

        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-xl font-semibold tracking-tight">
            {say(heading.title, lang)}
          </h1>
          <p className="text-fg-subtle mt-px truncate text-xs">{say(heading.sub, lang)}</p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={open}
          onClick={() => {
            const next = !open;
            setOpen(next);

            /*
             * `is_open`, the shop's own switch — not `status`, which is the
             * platform's word on whether this storefront is on the market at
             * all and which a merchant is not offered anywhere.
             *
             * The switch flips back if the write fails, and this is the one
             * control on the panel where that matters most: a header reading
             * "Yopiq" over a shop that is still taking orders sends a merchant
             * home while dinners arrive at an empty kitchen.
             */
            void post('/api/marketplace/settings', { isOpen: next }, lang).then((answer) => {
              if (answer.ok) {
                flash(say((next ? TRADING.open : TRADING.closed).flash, lang));

                return;
              }

              setOpen(!next);
              flash.problem(answer.message ?? say(NOT_SAVED, lang));
            });
          }}
          className={`flex h-[38px] flex-none items-center gap-2 rounded-[10px] border px-3.5 text-[13px] font-semibold ${
            open
              ? 'border-success-500/30 bg-success-50 text-success-700'
              : 'border-danger-500/30 bg-danger-50 text-danger-700'
          }`}
        >
          <span
            aria-hidden
            className={`size-[7px] flex-none rounded-full ${open ? 'bg-success-500' : 'bg-danger-500'}`}
          />
          {say(trading.label, lang)}
        </button>

        {/* `Do'kon paneli.dc.html:138-145` — the language segments and the theme
            button sit between the trading switch and the shop's own name. */}
        <MerchantLocale lang={lang} themeLabel={t.text.theme} />

        {/*
         * Whose shop this is. `shop` is the signed-in restaurant's own name;
         * null is the demo reader, and only then does the design's "Osh Xona ·
         * Chilonzor" belong on the screen. Printing it for everybody put
         * another restaurant's name above an owner's own orders.
         */}
        <div className="border-divider flex flex-none items-center gap-2.5 border-l pl-3.5">
          <span className="bg-brand-100 text-brand-700 grid size-8 place-items-center rounded-full text-xs font-bold">
            {shop === null ? 'OX' : initialsOf(shop)}
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold whitespace-nowrap">
              {shop ?? 'Osh Xona'}
            </span>
            {/* The second line is the venue and the city, which this panel does
                not know for a live shop — the session names one place, not two.
                Kept for the demo, dropped rather than guessed for a real one. */}
            {shop === null ? (
              <span className="text-fg-subtle block text-[11px] whitespace-nowrap">
                {t.text.chilonzor}
              </span>
            ) : null}
          </span>
        </div>
      </div>
    </header>
  );
}
