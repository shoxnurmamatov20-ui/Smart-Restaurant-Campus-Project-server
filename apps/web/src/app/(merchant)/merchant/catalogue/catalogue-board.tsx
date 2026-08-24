'use client';

import { useState } from 'react';

import { flash } from '@restaurant/ui';

import { apiId, post } from '@/lib/console-post';

import { som } from '../../../(guest)/guest-session';
import { merchantCopy } from '../../merchant-copy';
import {
  CATALOGUE_CATEGORIES,
  type CatalogueCategory,
  CATALOGUE_META,
  CATALOGUE_NOTES,
  CATALOGUE_SYNC,
  MERCHANT_DISHES,
  MERCHANT_EMPTY,
  NOT_SAVED,
  type CatalogueDish,
  say,
  type Lang,
} from '../../merchant-data';

/**
 * What a merchant sells on the marketplace, and for how much —
 * `Do'kon paneli.dc.html:246-296`.
 *
 * Nine dishes, five category chips and **six columns**. This carried five
 * dishes and five columns, and the two it was missing are the two the screen
 * exists for.
 *
 * **Margin, not "what you keep".** Net revenue is a number; margin against food
 * cost is a decision. Green above 50%, plain between 35 and 50, red below —
 * which is how a merchant finds the plate that is losing money on this channel
 * without reading nine rows of arithmetic.
 *
 * **Thirty-day sales beside it.** A 22% margin on 502 units and a 22% margin on
 * eleven are not the same problem, and a catalogue that shows only margin
 * cannot tell them apart.
 *
 * **The sync panel is the answer to "where does the menu live".** It lives in
 * the POS: names, recipes and the stop-list change there and arrive here. This
 * screen owns exactly two things — the marketplace price and whether the dish is
 * visible — and a merchant who does not know that maintains the menu twice.
 */
export function MerchantCatalogueBoard({
  lang,
  dishes = MERCHANT_DISHES,
  categories = CATALOGUE_CATEGORIES,
  commissionPercent = 0,
  live = false,
}: {
  lang: Lang;
  /** What is in the shop window, read through `merchant-server.ts`. */
  dishes?: readonly CatalogueDish[];
  /**
   * The filter chips, which have to arrive WITH the dishes.
   *
   * A live catalogue's sections are the restaurant's own — "Asosiy", "Kabob",
   * "Salat" — and the fixture's four are the design's. Passing one without the
   * other gives a row of chips that filter to nothing.
   */
  categories?: readonly CatalogueCategory[];
  /**
   * What this marketplace charges this merchant, from `meta.commission_percent`.
   *
   * It used to be `MARKETPLACE_COMMISSION_PERCENT` — the design's nine — and
   * that made this the one figure on the screen a merchant prices against and
   * the platform had never agreed to. A shop on a negotiated six saw every
   * margin understated by three points of turnover, and a merchant who reads a
   * plate as unprofitable delists it.
   *
   * Defaulted to **0**, not to nine, for the reason the read defaults to zero:
   * a rate this console invents is a rate somebody gets held to. At zero the
   * margin column is price minus food cost, which is true and visibly missing
   * a term, rather than false and plausible. The column header names the rate
   * so the reader can see which of the two they are looking at.
   */
  commissionPercent?: number;
  /**
   * Whether the rows above are this restaurant's or the design's sample.
   *
   * Marked on the page rather than left to be guessed at. A merchant panel that
   * quietly draws six invented orders when the API is unreachable is a merchant
   * cooking six dinners nobody ordered — the exact failure `renderWasDegraded()`
   * exists to make visible on the console, said here for a surface that has no
   * console shell to say it in.
   */
  live?: boolean;
}) {
  const money = (tiyin: number) => som(tiyin, lang);
  const t = merchantCopy(lang);

  const [category, setCategory] = useState(0);
  const [synced, setSynced] = useState(false);
  const [prices, setPrices] = useState<Record<string, number>>(() =>
    Object.fromEntries(dishes.map((dish) => [dish.id, dish.marketPrice])),
  );
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  const shown = dishes.filter((dish) => category === 0 || dish.category === category);
  const columns = 'grid grid-cols-[minmax(0,1fr)_110px_130px_96px_92px_84px] gap-3 px-4.5';

  /**
   * One or many rows, through the same door.
   *
   * `PATCH /api/v1/marketplace/catalogue` is a batch, which is what the button
   * above the table sends: every price the merchant re-typed, in one request,
   * because nine requests are nine chances to fail halfway and leave the window
   * half dressed. The visibility switch sends a batch of one down the same
   * route — a dish that has just run out must not wait for anything else to be
   * pressed.
   *
   * The price goes up as `market_price_tiyin` and the API stores the difference
   * against today's house price. That is the endpoint's decision and it is the
   * right one: a stored markup keeps tracking when the dining room re-prices,
   * and a stored second price silently stops.
   */
  function save(
    rows: readonly { id: string; marketPriceTiyin?: number; isListed?: boolean }[],
    told: string,
  ) {
    const items: { menuItemId: number; marketPriceTiyin?: number; isListed?: boolean }[] = [];

    for (const row of rows) {
      const menuItemId = apiId(row.id);

      if (menuItemId === null) continue;

      items.push({
        menuItemId,
        ...(row.marketPriceTiyin === undefined ? {} : { marketPriceTiyin: row.marketPriceTiyin }),
        ...(row.isListed === undefined ? {} : { isListed: row.isListed }),
      });
    }

    /*
     * Every row is the design's sample — `MERCHANT_DISHES` carries `d1`, `d2`.
     * The toast is the whole feature on a panel with no restaurant behind it,
     * and the wrapper already marks the table as not this merchant's.
     */
    if (items.length === 0) {
      flash(told);

      return;
    }

    void post('/api/marketplace/catalogue', { items }, lang).then((sent) => {
      if (sent.ok) {
        flash(told);

        return;
      }

      flash.problem(sent.message ?? say(NOT_SAVED, lang));
    });
  }

  return (
    <>
      {/*
        The whole screen, marked when it is drawing the design's sample rather
        than this restaurant's rows. On the wrapper rather than on one card,
        because "these figures are not yours" is true of everything below it —
        and a merchant panel that quietly shows six invented orders is a
        merchant cooking six dinners nobody ordered.
      */}
      <div data-demo={live ? undefined : ''} className="contents">
        {/* ------------------------------------------------------ POS sync */}
        <section className="border-border bg-surface mb-4 rounded-[14px] border px-5 py-4.5">
          <div className="grid items-center gap-4.5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              <p className="font-display text-[15px] font-bold tracking-tight">{t.text.catSyncH}</p>
              <p className="text-fg-muted mt-1 text-[13px] leading-relaxed">{t.text.catSyncP}</p>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <span className="text-fg-subtle text-right text-xs">
                {say(synced ? CATALOGUE_SYNC.fresh : CATALOGUE_SYNC.stale, lang)}
              </span>

              <button
                type="button"
                onClick={() => {
                  if (synced) {
                    flash.problem(say(CATALOGUE_SYNC.already, lang));
                    return;
                  }

                  setSynced(true);

                  /*
                   * Only the rows the merchant actually re-typed.
                   *
                   * Sending all nine would rewrite the markup of six dishes
                   * nobody touched — arithmetically a no-op today, and a
                   * silent re-anchoring of every uplift to whatever the house
                   * price happens to be at the moment somebody pressed a button
                   * about two of them.
                   */
                  save(
                    dishes
                      .filter((dish) => (prices[dish.id] ?? dish.marketPrice) !== dish.marketPrice)
                      .map((dish) => ({
                        id: dish.id,
                        marketPriceTiyin: prices[dish.id] ?? dish.marketPrice,
                      })),
                    say(CATALOGUE_SYNC.flash, lang),
                  );
                }}
                className={`h-[38px] flex-none rounded-[10px] border px-4 text-[13px] font-semibold ${
                  synced
                    ? 'border-success-500/40 bg-success-50 text-success-700'
                    : 'border-border-strong bg-surface text-fg'
                }`}
              >
                {say(synced ? CATALOGUE_SYNC.buttonDone : CATALOGUE_SYNC.button, lang)}
              </button>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------- categories */}
        <div className="mb-3.5 flex flex-wrap items-center gap-2">
          {categories.map((chip) => (
            <button
              key={chip.key}
              type="button"
              aria-pressed={category === chip.key}
              onClick={() => setCategory(chip.key)}
              className={`rounded-pill h-[34px] border px-3.5 text-[13px] font-semibold ${
                category === chip.key
                  ? 'border-fg bg-fg text-surface'
                  : 'border-border bg-surface text-fg-muted'
              }`}
            >
              {say(chip.label, lang)}
            </button>
          ))}

          <span className="flex-1" />

          <span data-num className="text-fg-subtle text-[13px]">
            {say(CATALOGUE_META.count, lang).replace('{n}', String(shown.length))}
          </span>
        </div>

        {/* ---------------------------------------------------------- table */}
        <div className="border-border bg-surface overflow-x-auto rounded-[14px] border">
          <div className="min-w-[820px]">
            <div
              className={`bg-bg-muted border-border text-fg-subtle text-2xs tracking-caps border-b py-3 font-semibold uppercase ${columns}`}
            >
              <span>{t.text.colDish}</span>
              <span className="text-right">{t.text.colPosPrice}</span>
              <span className="text-right">{t.text.colMpPrice}</span>
              {/* The rate in the heading, because the column is arithmetic and
                  the reader has to be able to check it. At 0 the term is absent
                  and saying so is the honest label. */}
              <span className="text-right">
                {t.text.colMargin}
                {commissionPercent > 0 ? ` −${commissionPercent}%` : ''}
              </span>
              <span className="text-right">{t.text.colSold}</span>
              <span className="text-right">{t.text.colOn}</span>
            </div>

            {shown.map((dish) => {
              const price = prices[dish.id] ?? dish.marketPrice;
              const off = hidden[dish.id] ?? dish.stopped === true;

              /*
               * The design's own margin: what is left of the marketplace price
               * after the food and the platform's cut, as a share of that price.
               * Computed rather than stored, so it follows the price the
               * merchant is typing — and the cut is this merchant's own rate,
               * not the design's nine.
               */
              const fee = (price * commissionPercent) / 100;
              const margin = price === 0 ? 0 : ((price - dish.foodCost - fee) / price) * 100;

              const meta = !off
                ? say(CATALOGUE_META.uplift, lang).replace(
                    '{amount}',
                    money(price - dish.housePrice),
                  )
                : dish.stopped === true && hidden[dish.id] === undefined
                  ? say(CATALOGUE_META.stopped, lang)
                  : say(CATALOGUE_META.hidden, lang);

              return (
                <div
                  key={dish.id}
                  className={`border-divider items-center border-b py-3 last:border-0 ${columns} ${
                    off ? 'opacity-50' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{say(dish.name, lang)}</p>
                    <p className="text-fg-subtle mt-0.5 text-xs">{meta}</p>
                  </div>

                  <span data-num className="text-fg-muted text-right text-[13px]">
                    {money(dish.housePrice)}
                  </span>

                  <span className="flex justify-end">
                    <input
                      inputMode="numeric"
                      value={Math.round(price / 100)}
                      onChange={(event) => {
                        const next = Number.parseInt(event.target.value.replace(/\D/g, ''), 10);

                        setPrices((now) => ({
                          ...now,
                          [dish.id]: Number.isNaN(next) ? 0 : next * 100,
                        }));
                      }}
                      aria-label={say(dish.name, lang)}
                      data-num
                      className="bg-bg-subtle border-border h-9 w-[112px] rounded-md border px-2.5 text-right text-[13px] font-semibold"
                    />
                  </span>

                  <span
                    data-num
                    className={`text-right text-[13px] font-semibold ${
                      margin >= 50
                        ? 'text-success-700'
                        : margin >= 35
                          ? 'text-fg'
                          : 'text-danger-600'
                    }`}
                  >
                    {margin.toFixed(1)}%
                  </span>

                  <span data-num className="text-fg-muted text-right text-[13px]">
                    {dish.sold === 0 ? '—' : dish.sold}
                  </span>

                  <span className="flex justify-end">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!off}
                      aria-label={say(dish.name, lang)}
                      title={say(off ? CATALOGUE_META.shown : CATALOGUE_META.hide, lang)}
                      onClick={() => {
                        const next = !off;
                        setHidden((now) => ({ ...now, [dish.id]: next }));

                        /*
                         * `off` is the switch and `is_listed` is the column, so
                         * the flag inverts here. Sent on its own, without the
                         * price beside it: a merchant hiding a dish that ran out
                         * has not agreed to anything about what it costs, and a
                         * half-typed number in the field two columns over would
                         * otherwise ride along with the tap.
                         */
                        save(
                          [{ id: dish.id, isListed: !next }],
                          say(
                            next ? CATALOGUE_META.flashHidden : CATALOGUE_META.flashShown,
                            lang,
                          ).replace('{name}', say(dish.name, lang)),
                        );
                      }}
                      className={`flex h-6 w-[42px] items-center rounded-full px-0.5 ${
                        off ? 'bg-border-strong justify-start' : 'bg-brand-500 justify-end'
                      }`}
                    >
                      <span className="size-[18px] rounded-full bg-white shadow-sm" />
                    </button>
                  </span>
                </div>
              );
            })}

            {/* A live catalogue with nothing in it is a real state now that the
                read no longer substitutes the design's dishes for it. */}
            {shown.length === 0 ? (
              <p className="text-fg-subtle px-4.5 py-9 text-center text-[13px]">
                {say(MERCHANT_EMPTY.catalogue, lang)}
              </p>
            ) : null}
          </div>
        </div>

        {/* ---------------------------------------------------------- notes */}
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {CATALOGUE_NOTES.map((note) => (
            <section
              key={say(note.head, lang)}
              className="border-border bg-surface rounded-[14px] border px-5 py-4.5"
            >
              <p className="text-sm font-semibold">{say(note.head, lang)}</p>
              <p className="text-fg-muted mt-1.5 text-[13px] leading-relaxed">
                {say(note.body, lang)}
              </p>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
