import { pathLocale } from '@/lib/server-locale';
import { notFound } from 'next/navigation';

import { allDishes, caloriesLabel, weightLabel } from '@restaurant/surfaces/guest/menu-data';
import { fetchGuestMenu } from '../../../../(guest)/guest-menu-server';
import { copyFor, fill, guestLocale, som } from '../../../locale-bridge';
import { AddButton, CartBar } from '../../../menu-island';
import { MenuBrowser } from '../../../menu-browser';
import { Star } from '../../../quick-actions';
import { SitePhoto } from '../../../site-photo';
import { SiteFooter } from '../../../site-footer';
import { SiteHeader } from '../../../site-header';
import { siteUrl } from '@/lib/site-url';

import { HIGHLIGHTS, VENUE, som as toTiyin } from '../../../venue-data';
import { fetchVenue, fetchDishOptions } from '../../../venue-server';
import { asScriptJson, breadcrumbs, menuGraph } from '../../../venue-schema';

/**
 * The whole menu, as a page rather than as an app.
 *
 * Every other menu in this repository is something to order from — a phone at a
 * table, a tablet at a till, a basket on a sofa. This one is something to
 * *read*, by a person deciding whether to come at all and by a crawler deciding
 * what this restaurant serves. Three consequences follow and they are the whole
 * design:
 *
 *   **Server-rendered; the search and the rail filter that HTML.** An earlier
 *   draft left both out on the grounds that a search box would put the dish
 *   names behind JavaScript. It would not: a client component's first paint is
 *   still server HTML, so the names ship either way. What matters is *who owns
 *   the list* — the island hides rows it did not render, so the markup a
 *   crawler reads is the whole menu whether or not the script runs.
 *
 *   **Prices in text, never in an image.** The single most common mistake a
 *   restaurant website makes: a photographed menu is invisible to a crawler, a
 *   screen reader and anybody who has turned images off on a train.
 *
 *   **Ordering is added as islands, never by making the page a client.** The
 *   `<li>` and every word inside it are still server HTML; only the round `+`
 *   at the end of the row and the basket bar are hydrated. A first attempt at
 *   this made the whole list a client component and moved every dish name
 *   behind JavaScript, which would have undone the one thing this page is for.
 *
 *   **The sold-out row is drawn, and today it never fires.** `specs/07 §4.2`
 *   dims a finished dish and chips it rather than removing it, and the state is
 *   built here — but `GET /api/v1/public/menu` drops stopped dishes from the
 *   payload instead of marking them, so on the live path the row is gone before
 *   this page sees it. The state reads `GuestDish.soldOut`, which reads
 *   `is_available`; the day the endpoint marks instead of drops, the screen is
 *   already right. Saying that out loud beats both alternatives: a badge nobody
 *   can explain, or a menu that quietly loses a dish a guest came for.
 */
/**
 * The "under 50 000" chip's threshold, in tiyin — `dc.html:858,862`.
 *
 * One constant for the filter and its own label, so the chip cannot say fifty
 * and mean five hundred.
 */
const CHEAP_UNDER = toTiyin(50_000);

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ restaurant: string }> }) {
  const { restaurant } = await params;
  const locale = guestLocale(await pathLocale(), null);
  const t = copyFor(locale).site;
  const menu = await fetchGuestMenu(restaurant, locale);
  const name = menu?.restaurant?.name ?? VENUE.name;
  const count = menu === null ? 0 : allDishes(menu).length;

  const here = `/r/${encodeURIComponent(restaurant)}/menu`;

  return {
    title: `${t.menu.title} — ${name}`,
    description: fill(t.menu.sub, { count }),
    alternates: {
      canonical: here,
      languages: {
        uz: `${here}?lang=uz`,
        ru: `${here}?lang=ru`,
        en: `${here}?lang=en`,
        'x-default': here,
      },
    },
  };
}

export default async function VenueMenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurant: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { restaurant } = await params;
  const { lang } = await searchParams;

  if (restaurant === '') notFound();

  const locale = guestLocale(lang ?? (await pathLocale()), null);
  const t = copyFor(locale).site;
  const [menu, venue] = await Promise.all([
    fetchGuestMenu(restaurant, locale),
    /* Contacts for the header and the footer — see `fetchVenue`. */
    fetchVenue(restaurant, '/menu'),
  ]);
  const name = menu?.restaurant?.name ?? VENUE.name;

  const categories = (menu?.categories ?? []).filter((category) => category.dishes.length > 0);
  const count = menu === null ? 0 : allDishes(menu).length;

  /*
   * The venue's own sizes and extras, one read for the whole page.
   *
   * `modifier_groups` ride down with the catalogue — the API eager-loads them
   * per dish precisely so a phone opening a sheet does not make a second
   * request over a café's Wi-Fi. Resolved here and handed to each row's island,
   * so the sheet opens instantly with the kitchen's own choices and the kitchen's
   * own option ids rather than the design's three portions.
   *
   * `null` when the catalogue itself did not answer, which is a different state
   * from "this dish asks nothing" and the sheet treats it as one: see
   * `DishSheet`. Deriving it from `menu` keeps the two reads in step — a sheet
   * offering live options over fixture prices would be the worst of both.
   */
  const sheets = menu === null ? null : await fetchDishOptions(restaurant, locale);

  /*
   * What the sheet offers under "usually ordered together" — `dc.html:747-761`.
   *
   * The design's own set beside a plov is a salad, a bread and a drink, which
   * is to say: three things from parts of the menu the dish is not in. That is
   * the heuristic here, computed once for the page rather than per row, and it
   * degrades to nothing on a menu with one category rather than suggesting the
   * dish next to itself.
   *
   * A *real* one would be a query over `order_items` — "guests who ordered the
   * plov also ordered" — and that is deliberately not published and not asked
   * for. It is a basket-affinity table, which is to say a map of a restaurant's
   * covers: what sells with what, in what proportion, refreshed nightly. On an
   * endpoint with no login, at a stable URL, the competitor across the road
   * reads the same page every morning and prices against it. This rule is
   * weaker and it is one a reader can check off the screen, which is the trade
   * this surface should be making with its own commercial data.
   */
  const suggestions = new Map<
    string,
    readonly { id: string; name: string; price: number; image: string | null }[]
  >();

  for (const category of categories) {
    suggestions.set(
      category.id,
      categories
        .filter((other) => other.id !== category.id)
        .map((other) => other.dishes.find((dish) => !dish.soldOut))
        .filter((dish) => dish !== undefined)
        .slice(0, 3)
        .map((dish) => ({
          id: dish.id,
          name: dish.name,
          price: dish.price,
          /*
           * The 160px `thumb`, not `imageUrl`: the suggestion is drawn at 44px
           * under the sheet and travels into a 64px basket row, and this is a
           * slim record on purpose — three per row, forty rows. The same rule
           * as `lineImageFrom` in `lib/guest-cart`, inlined because that
           * module is `'use client'` and a function imported from one cannot
           * be called on the server.
           */
          image: dish.image?.sizes.thumb?.url ?? dish.imageUrl,
        })),
    );
  }

  return (
    <>
      {/*
       * The menu as data, not only as a page.
       *
       * A priced `MenuItem` per dish is what lets a search result answer "how
       * much is plov at Osh Xona" without anybody clicking, and what feeds the
       * menu panel in Maps. Emitted only when the catalogue actually loaded —
       * markup describing an empty menu is a restaurant telling a crawler it
       * serves nothing.
       */}
      {menu !== null && categories.length > 0 ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: asScriptJson(menuGraph({ base: siteUrl(), restaurant, name, menu })),
          }}
        />
      ) : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: asScriptJson(
            breadcrumbs(siteUrl(), restaurant, name, { label: t.menu.title, path: '/menu' }),
          ),
        }}
      />

      <SiteHeader restaurant={restaurant} locale={locale} name={name} phone={venue.phone} />

      <main className="site-wrap py-10">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{t.menu.title}</h1>
        <p data-num className="text-fg-subtle mt-2 text-sm">
          {fill(t.menu.sub, { count })}
        </p>

        {menu === null ? (
          /* The API did not answer. Said plainly — an empty page under a
             heading reads as a restaurant with nothing to sell. */
          <p className="text-fg-subtle mt-8 text-sm">{t.common.offline}</p>
        ) : categories.length === 0 ? (
          <p className="text-fg-subtle mt-8 text-sm">{t.menu.empty}</p>
        ) : (
          <>
            {/*
             * Jump links, because a menu is nine headings long and a reader on
             * a phone should not scroll past the salads to find the plov. Plain
             * anchors: they work with JavaScript switched off, they are what a
             * crawler follows to understand the structure, and they cost
             * nothing.
             */}
            {/*
             * The toolbar and the 206px rail, as one island — `dc.html:253-283`.
             *
             * The list it wraps is still server HTML: it is passed as children
             * from this server component, so the island hides rows rather than
             * owning them. See `menu-browser.tsx` for why that distinction is
             * the whole design of this page.
             */}
            <MenuBrowser
              categories={categories.map((category) => ({
                id: category.id,
                name: category.name,
                count: category.dishes.length,
              }))}
              cheapUnderTiyin={CHEAP_UNDER}
              labels={{
                search: t.menu.search,
                all: t.menu.filters.all,
                hit: t.menu.filters.hit,
                available: t.menu.filters.available,
                cheap: fill(t.menu.filters.cheap, { amount: CHEAP_UNDER / 100 / 1000 }),
                found: t.menu.found,
                empty: t.menu.empty,
                emptySub: t.menu.emptySub,
                emptyCta: t.menu.emptyCta,
              }}
            >
              <div className="flex flex-col gap-12">
                {categories.map((category) => (
                  <section
                    key={category.id}
                    id={`c-${category.id}`}
                    data-category
                    className="scroll-mt-20"
                  >
                    <h2 className="font-display border-divider border-b pb-2 text-2xl font-semibold tracking-tight">
                      {category.name}
                    </h2>

                    <ul className="mt-1 flex flex-col">
                      {category.dishes.map((dish) => {
                        const weight = weightLabel(dish);
                        const calories = caloriesLabel(dish);
                        const highlight = HIGHLIGHTS.find((entry) =>
                          dish.name.toLowerCase().includes(entry.match),
                        );

                        return (
                          <li
                            key={dish.id}
                            /* What the island filters on. Lowercased here so the
                             client does not redo it on every keystroke, and the
                             price in tiyin so the "under 50 000" chip compares
                             numbers rather than parsing a formatted string. */
                            data-dish={`${dish.name} ${dish.description}`.toLowerCase()}
                            data-price={dish.price}
                            data-hit={highlight === undefined ? '0' : '1'}
                            data-soldout={dish.soldOut ? '1' : '0'}
                            className={`border-divider flex items-start gap-4 border-b py-4 last:border-0 ${
                              dish.soldOut ? 'opacity-55' : ''
                            }`}
                          >
                            {/*
                             * 96×96 — `dc.html:285-287`. FOUNDATIONS §12: the
                             * images do roughly 70% of the work on a food
                             * surface, and this page was rendering none of them
                             * although the endpoint has been sending `image_url`
                             * all along.
                             *
                             * `sizes="96px"`: the box, not the viewport. The
                             * browser fetches `thumb` at 1× and `card` at 2×
                             * for it, never the 1600px file thirty rows would
                             * otherwise download to paint thirty squares.
                             */}
                            <div className="bg-bg-muted hidden size-24 flex-none overflow-hidden rounded-md sm:block">
                              <SitePhoto
                                image={dish.image}
                                alt={dish.name}
                                sizes="96px"
                                className="!rounded-md"
                              />
                            </div>

                            <div className="min-w-0 flex-1">
                              <h3 className="text-md flex flex-wrap items-baseline gap-2 leading-snug font-semibold">
                                {dish.name}

                                {dish.soldOut ? (
                                  <span className="bg-danger-50 text-danger-700 text-2xs rounded-full px-2 py-0.5 font-bold">
                                    {t.menu.soldOut}
                                  </span>
                                ) : null}
                              </h3>

                              {dish.description !== '' ? (
                                <p className="text-fg-subtle mt-1 max-w-[62ch] text-sm leading-normal">
                                  {dish.description}
                                </p>
                              ) : null}

                              {/*
                               * Rating, grams and calories on one 12px line —
                               * `dc.html:300-306`. The calorie helper had been
                               * written and never called, so the row printed
                               * grams alone. The rating is only drawn where the
                               * highlight table has one: an invented star beside
                               * every dish is a review score nobody left.
                               */}
                              {highlight === undefined &&
                              weight === null &&
                              calories === null ? null : (
                                <p
                                  data-num
                                  className="text-fg-muted mt-1.5 flex flex-wrap items-center gap-2.5 text-xs"
                                >
                                  {highlight === undefined ? null : (
                                    <span className="flex items-center gap-1">
                                      <Star size={12} />
                                      <span className="font-semibold">{highlight.rating}</span>
                                    </span>
                                  )}
                                  {weight === null ? null : <span>{weight}</span>}
                                  {calories === null ? null : <span>{calories}</span>}
                                </p>
                              )}
                            </div>

                            {/*
                             * The price as text, on its own line, aligned right.
                             *
                             * A restaurant's menu page is read down the right
                             * edge as often as across — "what can I get for
                             * fifty" — and a price inside the paragraph makes
                             * that scan impossible.
                             */}
                            <p data-num className="flex-none pt-0.5 text-sm font-semibold">
                              {som(dish.price, locale)}
                            </p>

                            {/* No add button on a dish the kitchen has run out
                              of — `dc.html:311`. The chip above says why. */}
                            {dish.soldOut ? (
                              <span aria-hidden className="size-9 flex-none" />
                            ) : (
                              <AddButton
                                restaurant={restaurant}
                                dish={dish}
                                locale={locale}
                                label={t.menu.add}
                                groups={sheets === null ? null : (sheets.get(dish.id) ?? [])}
                                also={suggestions.get(category.id)}
                                copy={{
                                  close: t.sheet.close,
                                  portion: t.sheet.portion,
                                  portionOne: t.sheet.portions.one,
                                  portionLarge: t.sheet.portions.large,
                                  portionTwo: t.sheet.portions.two,
                                  addons: t.sheet.addons,
                                  addonsMax: t.sheet.addonsMax,
                                  addonQazi: t.sheet.addonList.qazi,
                                  addonEgg: t.sheet.addonList.egg,
                                  addonSalad: t.sheet.addonList.salad,
                                  addonBread: t.sheet.addonList.bread,
                                  note: t.sheet.note,
                                  notePlaceholder: t.sheet.notePlaceholder,
                                  add: t.sheet.add,
                                  often: t.sheet.often,
                                  added: t.sheet.added,
                                }}
                              />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </MenuBrowser>
          </>
        )}
      </main>

      <SiteFooter
        locale={locale}
        name={name}
        branches={venue.branches}
        phone={venue.phone}
        telegram={venue.telegram}
      />

      <CartBar
        restaurant={restaurant}
        locale={locale}
        href={`/r/${encodeURIComponent(restaurant)}/cart`}
        label={`${t.nav.cart} · {count} · {total}`}
      />
    </>
  );
}
