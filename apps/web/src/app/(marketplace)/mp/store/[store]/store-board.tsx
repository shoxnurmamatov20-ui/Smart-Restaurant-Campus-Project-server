'use client';

import Link from 'next/link';
import { useState } from 'react';

import { DishPhoto } from '@/components/dish-photo';
import { addLine, cartCount, cartSubtotal, useCart } from '@/lib/guest-cart';

import { som } from '../../../../(guest)/guest-session';
import { MpChrome } from '../../../mp-chrome';
import { fill, t } from '@restaurant/surfaces/mp/copy';
import { say, STORE_MENU, type Lang, type MpDish, type Store } from '@restaurant/surfaces/mp/data';
import { StoreInfoSheet } from '../../../mp-modals';

/**
 * Screen 2 of 4 — one merchant's menu.
 *
 * The hero, the meta row, sticky category chips and the dishes. On a desktop
 * the basket sticks to the right; on a phone it becomes the bar at the bottom,
 * which is the same information in the place a thumb can reach it.
 *
 * **A sale price is struck through, never merely coloured.** A number in red
 * beside a number in black is ambiguous to anyone who cannot separate the two,
 * and the one it is ambiguous about is what they are being charged.
 */
export function MpStoreBoard({
  lang,
  basket,
  store,
  menu = STORE_MENU,
}: {
  lang: Lang;
  basket: string;
  store: Store;
  /**
   * The shop's market menu, read on the server through `mp-server.ts`.
   *
   * Defaulted to the fixture so the board still renders when the API is
   * unreachable — but note that an EMPTY live menu is passed through as empty
   * rather than replaced: a restaurant that has joined and listed nothing yet
   * is a real state, and filling its window with sample dishes nobody can buy
   * would take orders the kitchen has never heard of.
   */
  menu?: readonly MpDish[];
}) {
  const money = (tiyin: number) => som(tiyin, lang);

  const cart = useCart(basket);
  const count = cartCount(cart);

  const categories = [...new Set(menu.map((dish) => say(dish.category, lang)))];
  const [category, setCategory] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  const shown =
    category === null ? menu : menu.filter((dish) => say(dish.category, lang) === category);

  return (
    <>
      <MpChrome lang={lang} basket={basket} />

      <div className="h-40 sm:h-56" style={{ background: store.tint }} aria-hidden />

      <main className="mx-auto max-w-[1120px] px-4 pb-24 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/*
           * `min-w-0`, and it is the difference between a page and a page that
           * scrolls sideways.
           *
           * A grid item's automatic minimum size is its min-content width, so
           * this column refused to go below the widest thing inside it — the
           * category rail, which is a `flex` row of chips. Measured at 320: the
           * column was 892px and the whole store page scrolled 604px sideways.
           * The `lg:` track already says `minmax(0,1fr)` for exactly this
           * reason; below `lg` there is no track to say it on, so the item has
           * to say it itself.
           */}
          <div className="min-w-0">
            <div className="-mt-8 flex items-start justify-between gap-4">
              <h1 className="font-display text-2xl font-semibold tracking-tight">{store.name}</h1>

              {/* "Do‘kon haqida" — hours, phone, branches, allergens. The
                  design gives the store page one sheet and this is it. */}
              <button
                type="button"
                data-tap
                onClick={() => setInfoOpen(true)}
                className="border-border bg-surface flex-none rounded-[11px] border px-4 text-[13px] font-semibold"
              >
                {t('shopInfo', lang)}
              </button>
            </div>

            <p data-num className="text-fg-subtle mt-1.5 text-sm">
              ★ {store.rating} · {fill(t('reviews', lang), { n: store.reviews })} ·{' '}
              {store.deliveryFee === 0 ? t('freeDelivery', lang) : money(store.deliveryFee)} ·{' '}
              {fill(t('window', lang), { from: store.minutesFrom, to: store.minutesTo })}
            </p>

            {/* Sticky, because a menu is scrolled and a chip that scrolls away
                turns navigation into scrolling back. */}
            <div className="bg-mp-bg sticky top-0 z-30 -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 py-2.5 sm:top-16">
              <button
                type="button"
                data-tap
                onClick={() => setCategory(null)}
                className={`rounded-pill flex-none border px-3.5 text-sm font-semibold ${
                  category === null ? 'border-brand-500 bg-brand-500 text-white' : 'bg-surface'
                }`}
              >
                {t('allStores', lang)}
              </button>

              {categories.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  data-tap
                  onClick={() => setCategory(entry)}
                  className={`rounded-pill flex-none border px-3.5 text-sm font-semibold ${
                    category === entry ? 'border-brand-500 bg-brand-500 text-white' : 'bg-surface'
                  }`}
                >
                  {entry}
                </button>
              ))}
            </div>

            <ul className="mt-3 flex flex-col gap-2">
              {shown.map((dish) => (
                <li
                  key={dish.id}
                  className={`bg-surface flex items-center gap-3 rounded-lg border px-4 py-3 ${
                    dish.soldOut ? 'opacity-55' : ''
                  }`}
                >
                  {/*
                   * 64px, so `sizes` says 64px: the browser fetches `thumb`
                   * (160px) for the square from the merchant's own size set,
                   * never the 1600px file. No photograph — a fixture dish, or a
                   * live one the merchant has not shot — is the shop's tint, the
                   * same flat panel the hero above stands in with.
                   */}
                  <DishPhoto
                    image={dish.image ?? null}
                    alt=""
                    sizes="64px"
                    className="size-16 flex-none rounded-[10px]"
                    fallback={
                      <span
                        aria-hidden
                        className="size-16 flex-none rounded-[10px]"
                        style={{ background: store.tint }}
                      />
                    }
                  />

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{say(dish.name, lang)}</span>
                    <span data-num className="mt-0.5 flex items-baseline gap-2 text-xs">
                      <span className="font-semibold">{money(dish.price)}</span>
                      {dish.was !== undefined ? (
                        <span className="text-fg-subtle line-through">{money(dish.was)}</span>
                      ) : null}
                    </span>
                  </span>

                  {dish.soldOut ? (
                    <span className="bg-danger-50 text-danger-700 rounded-pill flex-none px-2.5 py-1 text-[11px] font-bold">
                      {t('soldOut', lang)}
                    </span>
                  ) : (
                    <button
                      type="button"
                      data-tap
                      onClick={() =>
                        addLine(basket, {
                          dishId: dish.id,
                          name: say(dish.name, lang),
                          unitPrice: dish.price,
                          quantity: 1,
                          options: [],
                          note: '',
                        })
                      }
                      aria-label={`${t('add', lang)} ${say(dish.name, lang)}`}
                      className="border-brand-500 text-brand-600 hover:bg-brand-50 rounded-pill flex-none border px-4 text-sm font-semibold"
                    >
                      {t('add', lang)}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* The desktop basket. On a phone this is the bar below. */}
          <aside className="hidden lg:block">
            <div className="bg-surface sticky top-20 rounded-lg border p-5">
              <h2 className="text-md font-semibold">{t('cart', lang)}</h2>

              {count === 0 ? (
                <p className="text-fg-subtle mt-2 text-sm leading-normal">{t('emptySub', lang)}</p>
              ) : (
                <>
                  <ul className="mt-3 flex flex-col gap-2 text-sm">
                    {cart.lines.map((line) => (
                      <li key={line.key} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate">
                          <span data-num>{line.quantity}×</span> {line.name}
                        </span>
                        <span data-num className="flex-none font-medium">
                          {money(line.unitPrice * line.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/mp/cart"
                    data-tap="pay"
                    className="bg-brand-500 mt-4 flex items-center justify-center rounded-md text-sm font-semibold text-white"
                  >
                    {t('viewCart', lang)} · {money(cartSubtotal(cart))}
                  </Link>
                </>
              )}
            </div>
          </aside>
        </div>
      </main>

      {count > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-14 z-40 p-3 lg:hidden">
          <Link
            href="/mp/cart"
            data-tap="pay"
            className="bg-brand-500 pointer-events-auto mx-auto flex max-w-[560px] items-center justify-center gap-3 rounded-full px-6 text-sm font-semibold text-white"
          >
            <span>{t('viewCart', lang)}</span>
            <span aria-hidden>·</span>
            <span data-num>{count}</span>
            <span aria-hidden>·</span>
            <span data-num>{money(cartSubtotal(cart))}</span>
          </Link>
        </div>
      ) : null}

      {infoOpen ? (
        <StoreInfoSheet lang={lang} storeName={store.name} onClose={() => setInfoOpen(false)} />
      ) : null}
    </>
  );
}
