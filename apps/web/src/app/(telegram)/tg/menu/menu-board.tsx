'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { flash } from '@restaurant/ui';

import { DishPhoto } from '@/components/dish-photo';
import { addLine, cartCount, cartSubtotal, setQuantity, useCart } from '@/lib/guest-cart';

import { som } from '../../../(guest)/guest-session';

import { t } from '@restaurant/surfaces/tg/copy';
import { TgWhereLine } from './where-line';
import { TgAppBar } from '../../tg-app-bar';
import {
  say,
  TG_BOT,
  TG_CATEGORIES,
  TG_DELIVERY,
  TG_MENU,
  TG_PICKUP,
  type Lang,
  type TgCategory,
  type TgDish,
} from '@restaurant/surfaces/tg/data';
import { TgDock } from '../../tg-dock';
import { setMode, useMode } from '../../tg-mode';

/**
 * Screen 1 of 4 — the menu.
 *
 * The delivery header first, because it answers the two questions a guest has
 * before they look at a single dish: where is this going and what will it cost
 * to get there. **12 000 so'm and 25–35 minutes** — `Telegram.dc.html:536` and
 * `:812`. The build had 15 000 and a flat 35, which is a fee quoted three
 * thousand so'm high on the one screen read before ordering.
 *
 * Category chips over a flat list, and the counter lives on the row rather than
 * in a sheet: this is a bot's menu, tapped with a thumb between two other
 * things, and every extra screen between "I want that" and "it is in the
 * basket" is an order that does not happen.
 *
 * **A sold-out dish stays on the list and cannot be tapped.** Removing it makes
 * a guest who came for the shashlik think the restaurant never had one and go
 * somewhere else; dimming it with the word says *today*, which brings them back
 * tomorrow.
 */
export function TgMenuBoard({
  lang,
  basket,
  categories = TG_CATEGORIES,
  dishes = TG_MENU,
  live = false,
}: {
  lang: Lang;
  basket: string;
  /**
   * The restaurant's own card — `GET /api/v1/public/menu` through
   * `fetchGuestMenu()` and `tgMenuFrom()`.
   *
   * Defaulted to the design's ten dishes, and the default is what a browser
   * with no reachable API gets. It matters more here than on most screens: the
   * cart's `placeOrderPayloadFrom` refuses a basket whose dish ids are not
   * numbers, so a fixture menu is a mini app whose checkout cannot place an
   * order at all — which is what this surface did until the read landed.
   */
  categories?: readonly TgCategory[];
  dishes?: readonly TgDish[];
  live?: boolean;
}) {
  /*
   * Formatted here rather than handed down. A function cannot cross the
   * server/client boundary, and `som` is a pure lookup over a locale — the
   * guest surfaces' own menu board imports it the same way.
   */
  const money = (tiyin: number) => som(tiyin, lang);

  const router = useRouter();
  const cart = useCart(basket);
  const mode = useMode();
  const count = cartCount(cart);
  const subtotal = cartSubtotal(cart);

  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');

  const shown = dishes.filter((dish) => dish.categoryId === categoryId);

  /** How many of this dish are already in the basket, across its one variant. */
  const inBasket = (dishId: string) =>
    cart.lines.find((line) => line.dishId === dishId)?.quantity ?? 0;

  const when = mode === 'delivery' ? TG_DELIVERY.when : TG_PICKUP.when;

  return (
    <div className="flex min-h-dvh flex-col">
      <TgAppBar lang={lang} title={t('menu', lang)} />

      <main className="flex-1 px-4 pt-3.5 pb-32">
        {/*
         * Only when the read did not answer.
         *
         * Narrower than the shell's banner and more useful: this one says the
         * checkout will refuse, which is the fact a guest is about to run into.
         * `placeOrderPayloadFrom` rejects a basket whose dish ids are not
         * numbers, so a fixture menu is a basket that cannot become an order —
         * and being told that before filling it is the whole point.
         */}
        {live ? null : (
          <p
            role="status"
            className="mb-3 rounded-[12px] px-3.5 py-2.5 text-center text-[12px] leading-snug font-medium"
            style={{ background: 'var(--warning-50)', color: 'var(--warning-700)' }}
          >
            {t('sampleMenu', lang)}
          </p>
        )}
        {/* ------------------------------------------------ where it goes */}
        <section
          className="flex items-center gap-3 rounded-[14px] border px-4 py-3"
          style={{ background: 'var(--tg-card)', borderColor: 'var(--border)' }}
        >
          <span
            className="grid size-9 flex-none place-items-center rounded-[10px] text-[11px] font-extrabold"
            style={{ background: 'var(--acc-soft)', color: 'var(--acc)' }}
          >
            {TG_BOT.initials}
          </span>

          <span className="min-w-0 flex-1">
            {/* The guest's own saved address, read with the signature Telegram
                hands the WebView. It was the design guest's flat number, on
                every phone that opened the bot — see ./where-line.tsx. */}
            <TgWhereLine lang={lang} mode={mode} />
            <span data-num className="block text-[11px]" style={{ color: 'var(--tg-hint)' }}>
              {say(when, lang)}
            </span>
          </span>

          {/*
           * `switchMode`. The choice is held in `tg-mode.ts` because the cart
           * charges from it — a switch that only redraws this line would be a
           * fee the basket disagrees with.
           */}
          <button
            type="button"
            data-tap
            data-press
            onClick={() => {
              setMode(mode === 'delivery' ? 'pickup' : 'delivery');
              flash(t('modeSwitched', lang));
            }}
            className="rounded-pill flex-none border px-3 text-[11px] font-semibold"
            style={{
              background: 'var(--acc-soft)',
              borderColor: 'var(--acc-line)',
              color: 'var(--acc)',
            }}
          >
            {t('change', lang)}
          </button>
        </section>

        {/* ---------------------------------------------------- categories */}
        <nav
          data-scroll
          aria-label={t('menu', lang)}
          className="mt-3.5 flex gap-1.5 overflow-x-auto pb-1"
        >
          {categories.map((category) => {
            const on = category.id === categoryId;

            return (
              <button
                key={category.id}
                type="button"
                data-tap
                data-press
                aria-current={on}
                onClick={() => setCategoryId(category.id)}
                className="rounded-pill flex-none border px-3.5 text-xs font-semibold"
                style={
                  on
                    ? { background: 'var(--acc)', borderColor: 'var(--acc)', color: '#fff' }
                    : {
                        background: 'var(--tg-card)',
                        borderColor: 'var(--border)',
                        color: 'var(--tg-hint)',
                      }
                }
              >
                {say(category.name, lang)}
              </button>
            );
          })}
        </nav>

        {/* ---------------------------------------------------------- menu */}
        <ul className="mt-1">
          {shown.map((dish) => {
            const quantity = inBasket(dish.id);
            const key = cart.lines.find((line) => line.dishId === dish.id)?.key;

            return (
              <li
                key={dish.id}
                className={`flex gap-3 border-b py-3.5 last:border-0 ${
                  dish.soldOut ? 'opacity-50' : ''
                }`}
                style={{ borderColor: 'var(--divider)' }}
              >
                {/*
                 * 64px, so `sizes` says 64px: the browser fetches `thumb`
                 * (160px) for the square and never the 1600px file, on a
                 * phone, over mobile data, ten rows at a time. A fixture dish
                 * has no `image` at all and a live one without a photograph
                 * has null — both draw the design's own `.tg-shot` panel.
                 */}
                <DishPhoto
                  image={dish.image ?? null}
                  alt=""
                  sizes="64px"
                  className="size-16 flex-none rounded-[11px] border"
                  style={{ borderColor: 'var(--border)' }}
                  fallback={
                    <span
                      aria-hidden
                      className="tg-shot size-16 flex-none rounded-[11px] border"
                      style={{ borderColor: 'var(--border)' }}
                    />
                  }
                />

                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug font-semibold">{say(dish.name, lang)}</p>
                  <p
                    className="mt-1 text-[11px] leading-normal"
                    style={{ color: 'var(--tg-hint)' }}
                  >
                    {say(dish.description, lang)}
                  </p>

                  <div className="mt-2 flex items-center justify-between gap-2.5">
                    <span data-num className="text-sm font-bold">
                      {money(dish.price)}
                    </span>

                    {dish.soldOut ? (
                      <span
                        className="rounded-pill flex-none px-2.5 py-1 text-[10px] font-bold"
                        style={{ background: 'var(--danger-50)', color: 'var(--danger-700)' }}
                      >
                        {t('soldOut', lang)}
                      </span>
                    ) : (
                      <span className="flex flex-none items-center gap-1.5">
                        {quantity > 0 && key !== undefined ? (
                          <>
                            <button
                              type="button"
                              data-tap
                              data-press
                              onClick={() => setQuantity(basket, key, quantity - 1)}
                              aria-label="−"
                              className="grid size-[30px] place-items-center rounded-lg border text-[15px] font-semibold"
                              style={{
                                borderColor: 'var(--border-strong)',
                                background: 'var(--tg-card)',
                              }}
                            >
                              −
                            </button>
                            <span data-num className="w-5 text-center text-sm font-bold">
                              {quantity}
                            </span>
                          </>
                        ) : null}

                        <button
                          type="button"
                          data-tap
                          data-press
                          onClick={() => {
                            addLine(basket, {
                              dishId: dish.id,
                              name: say(dish.name, lang),
                              unitPrice: dish.price,
                              quantity: 1,
                              options: [],
                              note: '',
                            });
                            flash(`${say(dish.name, lang)} · ${t('added', lang)}`);
                          }}
                          aria-label={`${say(dish.name, lang)} +`}
                          className="grid size-[30px] place-items-center rounded-lg text-base font-semibold"
                          style={{ background: 'var(--acc)', color: '#fff' }}
                        >
                          +
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </main>

      {/*
       * Telegram's main button, as the design draws it — one control, full
       * width, carrying the running total. Grey and refusing rather than hidden
       * when the basket is empty: `mainGo` flashes "Avval taom tanlang", which
       * teaches what the button is for instead of leaving a guest to guess why
       * nothing happened.
       */}
      <div
        className="fixed inset-x-0 bottom-14 z-40 mx-auto max-w-[480px] border-t px-3.5 pt-2.5 pb-4"
        style={{ background: 'var(--tg-card)', borderColor: 'var(--border)' }}
      >
        <button
          type="button"
          data-tap="pay"
          data-press
          onClick={() => {
            if (count === 0) {
              flash.problem(t('pickDishFirst', lang));

              return;
            }

            router.push('/tg/cart');
          }}
          className="flex w-full items-center justify-center gap-2.5 rounded-[10px] text-[15px] font-semibold"
          style={{
            background: count === 0 ? 'var(--n-300)' : 'var(--acc)',
            color: '#fff',
          }}
        >
          <span>{count === 0 ? t('mainPickFirst', lang) : t('mainToOrder', lang)}</span>
          {count === 0 ? null : (
            <span data-num className="opacity-90">
              {money(subtotal)}
            </span>
          )}
        </button>
      </div>

      <TgDock lang={lang} basket={basket} />
    </div>
  );
}
