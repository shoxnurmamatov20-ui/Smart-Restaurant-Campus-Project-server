'use client';

import Link from 'next/link';
import { useState } from 'react';

import { DishPhoto } from '@/components/dish-photo';
import { Money, somText } from '../money';
import {
  POPULAR_IDS,
  say,
  type Branch,
  type Dish,
  type Lang,
} from '@restaurant/surfaces/customer/data';
import {
  DEMO_MENU,
  DEMO_VENUES,
  type CustomerMenu,
  type CustomerVenues,
} from '@restaurant/surfaces/customer/live';

/**
 * The customer app's home, as the design draws it —
 * `Smart Restaurant Mijoz ilovasi.dc.html:156-243`.
 *
 * Three controls at the top of this screen were missing or dead: the branch
 * picker, the delivery/pickup switch and the search field. They are not
 * decoration. Every price below them depends on which branch, every fee on
 * which mode, and search is how a returning customer orders the thing they
 * always order without reading a menu.
 *
 * A client component, and only this part of the screen is. The dock, the
 * metadata and the copy resolution stay on the server; what crosses the
 * boundary is fixtures and pre-resolved words.
 *
 * **The branch picker cycles rather than opening a sheet.** Five branches and a
 * pill: the design's own control is `cycleBranch`, and a bottom sheet for a
 * five-item list is a second screen to dismiss. It becomes a sheet the day a
 * chain has thirty.
 *
 * **The catalogue and the venues arrive as props.** They were module imports —
 * the fixtures — which meant the app's first screen priced four dishes the
 * restaurant had never sold and offered five branches it does not have. The
 * server reads both and hands them down; the fixtures stay as the default so
 * this component still renders in isolation, and `live: false` reaches the
 * screen with them.
 */
export function HomeBoard({
  lang,
  menu = DEMO_MENU,
  venues = DEMO_VENUES,
  words,
}: {
  lang: Lang;
  /** The catalogue, from `GET /api/v1/public/menu` — see `customer-server.ts`. */
  menu?: CustomerMenu;
  /** The venues, from `GET /api/v1/public/branches`. */
  venues?: CustomerVenues;
  words: {
    search: string;
    delivery: string;
    pickup: string;
    deliveryNote: string;
    pickupNote: string;
    promoTag: string;
    promoHeading: string;
    promoNote: string;
    categories: string;
    seeAll: string;
    popular: string;
    popularNote: string;
    loyalty: string;
    loyaltyNote: string;
    open: string;
    minutes: string;
    km: string;
    countUnit: string;
    soldOut: string;
    noHits: string;
    openHours: string;
  };
}) {
  const [branchIndex, setBranchIndex] = useState(0);
  const [mode, setMode] = useState<'delivery' | 'pickup'>('delivery');
  const [query, setQuery] = useState('');

  const dishes = menu.dishes;
  const categories = menu.categories;
  /* A restaurant with one venue still has one; an empty list means the API
     answered with nothing, and the picker has nothing to name. */
  const branches = venues.branches;
  // `% length` on an empty list is NaN, and the index survives a shrinking list
  // from a previous render — both end as `undefined` on a chip that must print
  // something, so the venue is optional from here down.
  const branch: Branch | null =
    branches.length === 0 ? null : (branches[branchIndex % branches.length] ?? null);
  const needle = query.trim().toLowerCase();

  /*
   * Search takes over the screen rather than filtering the popular grid.
   *
   * A customer typing "osh" wants every dish called that, not the four most
   * ordered ones that happen to match — and the design's search field sits
   * above everything for the same reason.
   */
  const hits =
    needle === ''
      ? []
      : dishes.filter(
          (dish) =>
            say(dish.name, lang).toLowerCase().includes(needle) ||
            say(dish.description, lang).toLowerCase().includes(needle),
        );

  /*
   * The design's four, in the design's order — `[MENU[0], MENU[6], MENU[7],
   * MENU[4]]`, which is plov, pepperoni, lavash, double burger. This was
   * `DISHES.filter(...).slice(0, 4)`, i.e. whatever happened to be first in the
   * catalogue: lagman and manti sat under a heading that claims to report what
   * everybody else is ordering. A "most ordered" rail computed from array order
   * is a lie a customer acts on.
   *
   * The list is a fixture of a real query — `GET /api/v1/analytics/top-items`,
   * last seven days — and `POPULAR_IDS` is where it lands when that exists.
   */
  const byId = new Map(dishes.map((dish) => [dish.id, dish]));
  /*
   * On a live catalogue the design's four ids do not exist, so the rail falls
   * back to the first four the restaurant actually sells. Still not "most
   * ordered" — `GET /api/v1/analytics/top-items` is where that comes from — but
   * four real dishes under the heading beats four the kitchen has never made.
   */
  const chosen = POPULAR_IDS.map((id) => byId.get(id)).filter(
    (dish): dish is Dish => dish !== undefined,
  );
  const popular = chosen.length > 0 ? chosen : dishes.slice(0, 4);

  return (
    <>
      <header
        className="px-[var(--phone-gutter)] pt-4"
        style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
      >
        <div className="flex items-center justify-between gap-3">
          {/* No chip at all when the restaurant published no venues: a picker
              with nothing in it is a control that cannot be right. */}
          {branch === null ? (
            <span />
          ) : (
            <button
              type="button"
              disabled={branches.length < 2}
              onClick={() => setBranchIndex((index) => (index + 1) % branches.length)}
              className="border-border bg-surface flex h-8.5 max-w-[230px] items-center gap-1.5 rounded-full border pr-3 pl-2.5 text-sm font-semibold"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="text-brand-600 flex-none"
              >
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
                <circle cx="12" cy="10" r="2.6" />
              </svg>

              {/*
               * A district is a proper noun and `Branch.name` is a plain string
               * for that reason. Chilonzor is Chilonzor in all three languages,
               * and translating it would be inventing places.
               */}
              <span className="truncate">{branch.name}</span>

              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden
                className="text-fg-subtle flex-none"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          )}

          <Link
            href="/customer/profile"
            aria-label={words.open}
            className="bg-brand-100 text-brand-700 grid size-9 flex-none place-items-center rounded-full text-xs font-bold"
          >
            DA
          </Link>
        </div>

        {/*
         * What the line says depends on the mode, exactly as `branchNote` does.
         *
         * On a delivery a customer needs the distance and the window; on a
         * pickup neither means anything — they are driving there — and what
         * they need is whether the branch is open. The line used to print the
         * delivery figures under both, so somebody choosing pickup at 23:30 was
         * told "1.8 km · 25–35 daqiqa" and nothing about the door being shut.
         */}
        {branch === null ? null : (
          <p data-num className="text-fg-subtle mt-1.5 text-xs">
            {mode === 'delivery'
              ? `${branch.address}${
                  branch.km === null ? '' : ` · ${branch.km} ${words.km}`
                } · ${branch.eta} ${words.minutes}`
              : `${branch.address} · ${words.openHours}`}
          </p>
        )}

        {/*
         * Delivery and pickup as one segmented control, not two cards.
         *
         * The pair used to be two inert panels side by side — the customer read
         * two notes and could act on neither, and the fee the cart charged did
         * not follow from anything on this screen.
         */}
        <div className="bg-bg-muted mt-3.5 flex gap-0.5 rounded-md p-0.5">
          {(['delivery', 'pickup'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => setMode(option)}
              className={`h-9 flex-1 rounded-lg text-sm font-semibold ${
                mode === option ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted'
              }`}
            >
              {option === 'delivery' ? words.delivery : words.pickup}
            </button>
          ))}
        </div>

        {/* The delivery note quotes this venue's own fee, so with no venue there
            is no figure to quote and the line goes rather than guesses. */}
        {mode === 'delivery' && branch === null ? null : (
          <p className="text-fg-subtle mt-2 text-xs leading-normal">
            {mode === 'delivery' && branch !== null
              ? words.deliveryNote.replace('{amount}', somText(branch.deliveryFee, lang))
              : words.pickupNote}
          </p>
        )}

        <div className="border-border bg-bg-subtle mt-3.5 flex h-11 items-center gap-2.5 rounded-md border px-3.5">
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            aria-hidden
            className="text-fg-subtle flex-none"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4.3-4.3" />
          </svg>

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={words.search}
            aria-label={words.search}
            type="search"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />

          {query === '' ? null : (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={words.seeAll}
              className="bg-bg-muted text-fg-muted grid size-6 flex-none place-items-center rounded-full text-sm leading-none"
            >
              ×
            </button>
          )}
        </div>
      </header>

      {needle !== '' ? (
        <section className="mt-4 px-[var(--phone-gutter)]">
          {hits.length === 0 ? (
            <p className="text-fg-subtle py-8 text-center text-sm">{words.noHits}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2.5">
              {hits.map((dish) => (
                <DishCard key={dish.id} dish={dish} lang={lang} soldOut={words.soldOut} />
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          {/* ------------------------------------------------------- promo */}
          <section className="mt-4.5 px-[var(--phone-gutter)]">
            <div className="border-border bg-surface overflow-hidden rounded-lg border">
              <div className="c-shot h-[134px]" aria-hidden />
              <div className="border-divider border-t px-4 pt-3.5 pb-4">
                <p className="text-brand-600 text-2xs tracking-caps font-bold uppercase">
                  {words.promoTag}
                </p>
                <h2 className="font-display tracking-snug mt-1.5 text-lg leading-tight font-bold">
                  {words.promoHeading}
                </h2>
                <p data-num className="text-fg-muted mt-1.5 text-xs">
                  {words.promoNote}
                </p>
              </div>
            </div>
          </section>

          {/* -------------------------------------------------- categories */}
          <div className="flex items-baseline justify-between px-[var(--phone-gutter)] pt-5.5 pb-2.5">
            <h2 className="font-display tracking-snug text-lg font-bold">{words.categories}</h2>
            <Link href="/customer/menu" className="text-brand-600 text-sm font-semibold">
              {words.seeAll}
            </Link>
          </div>

          {/*
           * A horizontal rail, not a two-column grid of text rows.
           *
           * The design gives each category a 98px card with a picture and the
           * number of dishes under it. The count is the part that earns the
           * rail: "Milliy 18" tells a customer where the menu actually is.
           */}
          <ul data-scroll className="flex gap-2.5 overflow-x-auto px-[var(--phone-gutter)] pb-1">
            {categories.map((category) => (
              <li key={category.id} className="flex-none">
                <Link
                  href={`/customer/menu?c=${category.id}`}
                  className="border-border bg-surface block w-[98px] overflow-hidden rounded-lg border"
                >
                  <span className="c-shot block h-[62px]" aria-hidden />
                  <span className="block px-2.5 pt-2 pb-2.5">
                    <span className="block truncate text-xs font-semibold">
                      {say(category.name, lang)}
                    </span>
                    <span data-num className="text-fg-subtle text-3xs mt-0.5 block">
                      {dishes.filter((dish) => dish.categoryId === category.id).length}{' '}
                      {words.countUnit}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {/* ----------------------------------------------------- popular */}
          <div className="flex items-baseline justify-between px-[var(--phone-gutter)] pt-5.5 pb-2.5">
            <h2 className="font-display tracking-snug text-lg font-bold">{words.popular}</h2>
            <span data-num className="text-fg-subtle text-xs">
              {words.popularNote}
            </span>
          </div>

          <ul className="grid grid-cols-2 gap-2.5 px-[var(--phone-gutter)]">
            {popular.map((dish) => (
              <DishCard key={dish.id} dish={dish} lang={lang} soldOut={words.soldOut} />
            ))}
          </ul>

          {/* ----------------------------------------------------- loyalty */}
          {/*
           * The strip the design puts at the foot of the home screen. Without
           * it the loyalty screen was reachable only from a settings row on the
           * profile — three taps from the place the points are earned.
           */}
          <div className="border-border bg-bg-subtle mx-[var(--phone-gutter)] mt-5.5 flex items-center gap-3.5 rounded-lg border px-4.5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{words.loyalty}</p>
              <p data-num className="text-fg-muted mt-0.5 text-xs">
                {words.loyaltyNote}
              </p>
            </div>

            <Link
              href="/customer/loyalty"
              className="border-border-strong bg-surface grid h-9 flex-none place-items-center rounded-md border px-3.5 text-sm font-semibold"
            >
              {words.open}
            </Link>
          </div>
        </>
      )}
    </>
  );
}

/** One dish tile — `dc.html:216-233`: picture, name, rating, price. */
function DishCard({ dish, lang, soldOut }: { dish: Dish; lang: Lang; soldOut: string }) {
  return (
    <li>
      <Link
        href={`/customer/menu?d=${dish.id}`}
        className="border-border bg-surface block overflow-hidden rounded-lg border"
      >
        <span className="c-shot block h-[104px]" aria-hidden>
          {/*
           * Half the 390px column, less gutters — about 175px — so `sizes`
           * says so rather than `50vw`: the shell is capped at the phone
           * measure on a desktop, and a viewport-relative hint there would
           * fetch `full` for a tile the width of a thumb. `card` (640px)
           * covers 175px at 3×. No photograph leaves the `.c-shot` tint.
           */}
          <DishPhoto
            image={dish.image ?? null}
            alt=""
            sizes="(min-width: 390px) 175px, 50vw"
            className="size-full"
          />

          {dish.soldOut ? (
            <span className="bg-danger-50 text-danger-700 text-2xs absolute top-2 left-2 rounded-full px-2 py-0.5 font-bold">
              {soldOut}
            </span>
          ) : null}
        </span>

        <span className="block px-3 pt-2.5 pb-3">
          <span className="block truncate text-sm font-semibold">{say(dish.name, lang)}</span>

          <span className="mt-1 flex items-center gap-1.5">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="var(--rating-star)" aria-hidden>
              <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.2-5.9 3.2 1.2-6.5L2.5 9.4l6.6-.9z" />
            </svg>
            <span data-num className="text-fg-muted text-2xs font-semibold">
              {dish.rating}
            </span>
            <span data-num className="text-fg-subtle text-2xs">
              ({dish.reviews})
            </span>
          </span>

          <Money tiyin={dish.price} lang={lang} className="font-display mt-1.5 block font-bold" />
        </span>
      </Link>
    </li>
  );
}
