import { pathLocale } from '@/lib/server-locale';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { fetchGuestMenu } from '../../../(guest)/guest-menu-server';
import { allDishes } from '@restaurant/surfaces/guest/menu-data';
import { copyFor, fill, guestLocale, som as money, somParts } from '../../../(guest)/guest-session';
import { siteUrl } from '@/lib/site-url';

import { HIGHLIGHTS, isOpenAt, say, VENUE, type SiteLocale } from '../../venue-data';
import { fetchVenue } from '../../venue-server';
import { SitePhoto } from '../../site-photo';
import { QUICK_ACTIONS, Star } from '../../quick-actions';
import { asScriptJson, breadcrumbs, venueGraph } from '../../venue-schema';
import { SiteHeader } from '../../site-header';
import { SiteFooter } from '../../site-footer';

/**
 * The restaurant's front page.
 *
 * The one surface in this repository written to be found by a stranger. Every
 * other one is reached by scanning a code, signing in, or being handed a
 * tablet; this one is reached by typing a restaurant's name into a search box,
 * which is why it is the only page here that is server-rendered whole, carries
 * real metadata, and puts its opening hours in text rather than in an image.
 *
 * ---------------------------------------------------------------------------
 * What is live and what is not
 *
 * The menu is real — `GET /api/v1/public/menu` is published, tenant-scoped, and
 * only ever lists what is actually for sale. Booking is real: `POST
 * /api/v1/public/reservations` was written for this page. The venue itself is
 * now real too: `GET /api/v1/public/site` publishes the name, the branches,
 * their addresses, their telephones and their hours — narrowed on the server to
 * what is already printed on the door, which is why it can be read with no
 * credential at all.
 *
 * The rating and the "most ordered" figures are the venue's own editorial
 * choice rather than a count, and that is a decision rather than a gap — see
 * `HIGHLIGHTS` in `venue-data.ts`. Everything else a stranger reads here came
 * from the restaurant's own record.
 *
 * The distinction matters more here than anywhere else on the platform: a menu
 * that is wrong is a guest ordering something the kitchen does not have, and
 * this page is the one a stranger trusts before they have met anybody.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ restaurant: string }> }) {
  const { restaurant } = await params;
  const locale = guestLocale(await pathLocale(), null);
  const t = copyFor(locale).site;
  const menu = await fetchGuestMenu(restaurant, locale);
  const name = menu?.restaurant?.name ?? VENUE.name;

  /*
   * Indexed, deliberately, and the only page in this repository that is.
   *
   * `app/robots.ts` disallows every other surface — the console, the till, the
   * guest QR pages, the customer app — because they are somebody's private
   * session or a table's landing page. This is a restaurant's shop window, and
   * a shop window nobody can find is not a shop window.
   */
  const here = `/r/${encodeURIComponent(restaurant)}`;

  return {
    title: `${name} — ${t.nav.menu}`,
    description: t.home.body,
    /*
     * Canonical and hreflang, which are one decision rather than two.
     *
     * The same page answers on `?lang=uz`, `?lang=ru` and `?lang=en`, so
     * without these a crawler sees three URLs with different text and has to
     * guess whether they are duplicates, translations, or three pages. It
     * usually guesses "duplicates" and indexes one — which on a trilingual
     * restaurant site means two of the three languages never appear in a
     * result at all.
     *
     * `x-default` points at the bare URL because that is what a reader with no
     * matching language should land on: the page negotiates from
     * `Accept-Language` when nothing is asked for.
     */
    /*
     * The venue's own manifest, overriding the platform's.
     *
     * `public/manifest.json` starts at `/dashboard` — the staff console — so
     * without this a guest installing from a restaurant's site would get an
     * icon that opens a sign-in form they have no account for.
     */
    manifest: `${here}/manifest.webmanifest`,
    alternates: {
      canonical: here,
      languages: {
        uz: `${here}?lang=uz`,
        ru: `${here}?lang=ru`,
        en: `${here}?lang=en`,
        'x-default': here,
      },
    },
    openGraph: {
      title: name,
      description: t.home.body,
      type: 'website',
      url: here,
      locale: locale === 'ru' ? 'ru_RU' : locale === 'en' ? 'en_US' : 'uz_UZ',
    },
  };
}

export default async function VenueHomePage({
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
    fetchVenue(restaurant, '/'),
  ]);
  // The menu names the restaurant too, and the two agree when both are live.
  // Preferring the menu keeps the heading identical to the one the menu page
  // draws, which is the same restaurant seen twice.
  const name = menu?.restaurant?.name ?? venue.name;
  const dishes = menu === null ? [] : allDishes(menu);
  const branches = venue.branches;

  /*
   * The clock the venue keeps, not the reader's.
   *
   * A guest in London looking at a Tashkent restaurant should be told whether
   * the kitchen is open in Tashkent. `Intl` with an explicit zone is what makes
   * that true regardless of where the server or the reader happens to be.
   */
  const nowHere = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tashkent',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());

  const here = `/r/${encodeURIComponent(restaurant)}`;
  /*
   * The venue whose clock the "open now" chip reads: the first branch, or
   * none. It used to fall back to the design's Chilonzor, so a restaurant
   * that had not published a venue said it was open until 23:00 on the
   * demo's hours and promised the demo's delivery window. With no venue the
   * chip says closed and the delivery line stays off — which is what a
   * guest can actually act on.
   */
  const flagship = branches[0] ?? null;
  const open = flagship !== null && isOpenAt(flagship, nowHere);
  /* The restaurant's own words, or a line that claims nothing — the demo's
     2014 story is the demo's. Same rule as the about page. */
  const aboutBody = venue.live
    ? venue.about !== null && venue.about.trim() !== ''
      ? venue.about
      : fill(t.about.unwritten, { name })
    : t.about.body;

  /*
   * The free-delivery threshold as a grouped number, formatted once.
   *
   * The hero strip and the delivery card both print it. `somParts` owns the
   * grouping rule for every price on this surface, so it owns this one too —
   * two formatters would drift on the separator within a release.
   */
  const freeFrom = somParts(VENUE.freeDeliveryOver, locale).amount;

  /*
   * The four dishes the strip's heading claims are ordered most often.
   *
   * Resolved from `HIGHLIGHTS` by name, because the design's dish ids belong to
   * its own fixture and a real tenant's are whatever the database issued. What
   * matters here is the `curated` flag underneath: the subtitle says "over the
   * last 30 days" only when the numbers behind that sentence actually resolved.
   * The strip used to be `dishes.slice(0, 4)` under that heading, which asserted
   * a ranking nothing had been sorted by — on the one page a stranger reads as
   * the kitchen's own recommendation.
   */
  const highlighted = HIGHLIGHTS.map((highlight) => {
    const dish = dishes.find((entry) => entry.name.toLowerCase().includes(highlight.match));

    return dish === undefined ? null : { dish, highlight };
  }).filter((entry) => entry !== null);

  const curated = highlighted.length === HIGHLIGHTS.length;

  const popular = curated
    ? highlighted
    : dishes.slice(0, 4).map((dish) => ({ dish, highlight: null }));

  const base = siteUrl();

  return (
    <>
      {/*
       * The markup a search result is built from.
       *
       * In the body rather than the head, which is where Google's own
       * documentation puts it and where Next's metadata API cannot reach: it
       * has no field for arbitrary JSON-LD. It is inert to a browser and
       * invisible to a reader, and it is the difference between a blue link and
       * a result showing this restaurant's hours, rating and menu.
       *
       * `asScriptJson`, never `JSON.stringify`. The restaurant's name comes
       * from the API and this is a script element — see the function.
       */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: asScriptJson(
            venueGraph({
              base,
              restaurant,
              name,
              locale: locale as SiteLocale,
              description: t.home.body,
              /* This restaurant's own branches, and no invented rating. The
                 graph read `BRANCHES` and `VENUE.rating`, so every venue on the
                 platform published the demo's five addresses and a 4.9 over
                 1 240 reviews as structured data — which is the one output
                 search engines read and repeat. */
              branches: venue.branches,
              live: venue.live,
            }),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: asScriptJson(breadcrumbs(base, restaurant, name)),
        }}
      />

      <SiteHeader restaurant={restaurant} locale={locale} name={name} phone={venue.phone} />

      <main>
        {/* ------------------------------------------------------------ hero */}
        <section data-sec className="site-wrap">
          <div className="site-hero">
            <div>
              <p
                className={`text-2xs inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-bold tracking-wide uppercase ${
                  open ? 'bg-success-50 text-success-700' : 'bg-bg-muted text-fg-muted'
                }`}
              >
                <span aria-hidden>●</span>
                {open && flagship?.closes != null
                  ? fill(t.home.openNow, { until: flagship.closes })
                  : open
                    ? t.home.open
                    : t.home.closedNow}
              </p>

              {/*
               * 58px/800, per `specs/07 §3`. It was 48/600 — two steps light
               * and one size down on the single piece of display type the page
               * is built around, which is the difference between a headline
               * that arrives and one that reads like a subheading.
               */}
              <h1 className="font-display mt-3 text-4xl leading-[1.02] font-extrabold tracking-tight sm:text-[58px]">
                {t.home.title}
              </h1>

              <p className="text-fg-muted mt-4 max-w-[52ch] text-lg leading-relaxed text-pretty">
                {t.home.body}
              </p>

              <p
                data-num
                className="text-fg-muted mt-5.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"
              >
                <span className="flex items-center gap-1.5">
                  <Star size={17} />
                  <span className="text-fg font-display text-[17px] font-bold">{VENUE.rating}</span>
                  <span className="text-fg-subtle">
                    {fill(t.home.ratings, { count: VENUE.ratingCount })}
                  </span>
                </span>
                {/* The delivery window only when the venue published one. */}
                {flagship?.deliveryEta == null ? null : (
                  <>
                    <span aria-hidden className="bg-border hidden h-4.5 w-px sm:block" />
                    <span>{fill(t.home.eta, { range: flagship.deliveryEta })}</span>
                  </>
                )}
                <span aria-hidden className="bg-border hidden h-4.5 w-px sm:block" />
                <span>{fill(t.home.freeFrom, { amount: freeFrom })}</span>
              </p>

              <div className="mt-6 flex flex-wrap gap-2.5">
                <Link
                  href={`${here}/menu?lang=${locale}`}
                  className="bg-acc text-md grid h-13 place-items-center rounded-md px-6.5 font-semibold text-white"
                >
                  {t.home.ctaOrder}
                </Link>
                <Link
                  href={`${here}/book?lang=${locale}`}
                  className="border-border-strong bg-surface text-md grid h-13 place-items-center rounded-md border px-6 font-semibold"
                >
                  {t.home.ctaBook}
                </Link>
              </div>
            </div>

            {/*
             * The hero photograph — `dc.html:167-169`, 420px tall.
             *
             * The first popular dish's own image, because the endpoint that
             * publishes a venue's hero shot does not exist and the alternative
             * is the grey panel this page shipped with. `eager`: it is the one
             * image above the fold and lazy-loading it would leave a hole in
             * the first paint on the page the whole site is judged by.
             *
             * `sizes` is the column: 420px wide once the two-column hero
             * engages, the whole viewport below that. The one box on the site
             * that earns `full` on a 3× phone, and the one that should not
             * get it on a 1× laptop.
             */}
            <div className="border-border bg-bg-muted h-[320px] overflow-hidden rounded-2xl border sm:h-[420px]">
              <SitePhoto
                image={popular[0]?.dish.image ?? null}
                alt={popular[0]?.dish.name ?? name}
                sizes="(min-width: 900px) 420px, 100vw"
                eager
                className="h-full rounded-2xl"
              />
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- quick actions */}
        {/*
         * Four cards, `dc.html:170-181`. Not decoration: they are the four
         * things a reader arrives wanting, and three of them are a link the
         * page could otherwise only offer through the header. The fourth is a
         * telephone number, because a forty-person order is not something this
         * site can take and pretending otherwise would book a wedding nobody
         * in the kitchen knows about.
         */}
        <section data-sec className="site-wrap !pt-0">
          <ul data-4up className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {QUICK_ACTIONS.map((action) => {
              const label = t.home.quick[action.key];
              /* A window the venue has not published is drawn as a dash rather
                 than as the design's `35–50` — this line tells a guest how long
                 they will be waiting for dinner. */
              const sub = fill(t.home.quick[action.sub], {
                range: flagship.deliveryEta ?? '—',
                amount: freeFrom,
                minutes: flagship.pickupMinutes ?? '—',
                people: 40,
              });

              const body = (
                <>
                  <span className="bg-acc-soft text-acc-dark grid size-[38px] place-items-center rounded-[11px]">
                    <svg
                      width="19"
                      height="19"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d={action.icon} />
                    </svg>
                  </span>
                  <span className="font-display mt-3.5 block text-base font-bold tracking-tight">
                    {label}
                  </span>
                  <span className="text-fg-subtle mt-1 block text-[13px] leading-normal">
                    {sub}
                  </span>
                </>
              );

              const shell =
                'site-card border-border bg-surface block rounded-lg border p-5 text-left';

              return (
                <li key={action.key}>
                  {action.href === null ? (
                    /* The large-order card is the telephone. `tel:` rather than
                       a toast, which is what the design can do and a real site
                       cannot: a toast saying "call this number" on a phone is a
                       number the reader then has to retype. A restaurant that
                       has published no number gets the card without the link,
                       rather than a link to the demo's. */
                    venue.phone === null ? (
                      <span className={shell}>{body}</span>
                    ) : (
                      <a href={`tel:${venue.phone.replace(/[^+\d]/g, '')}`} className={shell}>
                        {body}
                      </a>
                    )
                  ) : (
                    <Link href={`${here}${action.href}?lang=${locale}`} className={shell}>
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* --------------------------------------------------------- popular */}
        {popular.length > 0 ? (
          <section data-sec className="site-wrap border-divider border-t">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-3xl font-bold tracking-tight">{t.home.popular}</h2>
                <p className="text-fg-muted mt-1.5 text-[15px]">
                  {curated ? t.home.popularSub : t.home.popularAny}
                </p>
              </div>

              <Link
                href={`${here}/menu?lang=${locale}`}
                className="text-acc flex-none text-sm font-semibold"
              >
                {t.home.seeAll} →
              </Link>
            </div>

            <ul data-4up className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {popular.map(({ dish, highlight }) => (
                <li
                  key={dish.id}
                  className="site-card border-border bg-surface overflow-hidden rounded-lg border"
                >
                  <div className="bg-bg-muted relative h-[168px] overflow-hidden">
                    {/* A quarter of the 1320px measure on a desktop, half the
                        viewport below `lg` — `card` (640px) covers both at 2×,
                        so none of the four fetches the 1600px file. */}
                    <SitePhoto
                      image={dish.image}
                      alt={dish.name}
                      sizes="(min-width: 1024px) 310px, 50vw"
                      className="h-[168px]"
                    />

                    {highlight?.badge === undefined ? null : (
                      <span
                        className={`absolute top-3 left-3 flex h-6 items-center rounded-full px-2.5 text-[11px] font-bold text-white ${
                          highlight.badge === 'mostOrdered' ? 'bg-acc' : 'bg-n-800'
                        }`}
                      >
                        {highlight.badge === 'mostOrdered' ? t.home.mostOrdered : t.home.baked}
                      </span>
                    )}
                  </div>

                  <div className="px-4 pt-4 pb-4.5">
                    <div className="flex items-baseline justify-between gap-2.5">
                      <p className="font-display text-base font-bold tracking-tight">{dish.name}</p>
                      <p data-num className="font-display flex-none text-base font-bold">
                        {money(dish.price, locale)}
                      </p>
                    </div>

                    {dish.description === '' ? null : (
                      <p className="text-fg-subtle mt-1.5 line-clamp-2 text-[13px] leading-normal">
                        {dish.description}
                      </p>
                    )}

                    {highlight === null ? null : (
                      <p className="mt-2.5 flex items-center gap-1.5">
                        <Star />
                        <span data-num className="text-xs font-semibold">
                          {highlight.rating}
                        </span>
                        <span data-num className="text-fg-subtle text-xs">
                          {fill(t.home.orders, { count: highlight.orders30d })}
                        </span>
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section data-sec className="site-wrap border-divider border-t">
            {/* Two different silences. The menu did not load — said plainly,
                not drawn as an empty strip a reader would take for a restaurant
                with no food. Or it loaded and there is no food yet — a
                restaurant on its first day, which is not the server's fault and
                must not be blamed on it. */}
            <p className="text-fg-subtle text-sm">
              {menu === null ? t.common.offline : t.common.menuUnwritten}
            </p>
          </section>
        )}

        {/* -------------------------------------------------------- promises */}
        {/*
         * Three panels hairlined by a 1px gap over the divider colour, inside
         * one rounded border — `dc.html:219-227`. It is the only place on the
         * page that says why this restaurant rather than the next one, and it
         * had been left out entirely.
         */}
        {/*
         * The demo's three promises — "12 years in one place, since 2014 in
         * Chilonzor", "1 240 ratings" — are the demo's. A live restaurant has
         * none written yet (nothing on `/public/site` carries them), and a
         * stranger reading another restaurant's years and ratings under this
         * one's name is the worst thing this page could say. Until a
         * restaurant can write its own, the section is the demo's alone.
         */}
        {venue.live ? null : (
          <section data-sec className="site-wrap">
            <ul
              data-3up
              className="border-border bg-divider grid gap-px overflow-hidden rounded-lg border sm:grid-cols-3"
            >
              {t.home.promises.map((promise) => (
                <li key={promise.head} className="bg-surface px-6 py-6.5">
                  <p
                    data-num
                    className="font-display text-acc text-[32px] font-extrabold tracking-tight"
                  >
                    {promise.value}
                  </p>
                  <p className="font-display mt-2 text-base font-bold tracking-tight">
                    {promise.head}
                  </p>
                  <p className="text-fg-muted mt-1.5 text-sm leading-relaxed">{promise.body}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* -------------------------------------------------------- branches */}
        <section data-sec id="branches" className="site-wrap border-divider border-t">
          <h2 className="font-display text-2xl font-semibold tracking-tight">{t.home.branches}</h2>
          <p className="text-fg-subtle mt-1 text-sm">{t.home.branchesSub}</p>

          {/*
           * One bordered list of rows, not a three-up card grid — `dc.html:231-244`.
           * Five branches as cards is a wall a reader scans; as rows it is a
           * table they read down, and the four things they want (name, address,
           * hours, open) line up in columns instead of moving with the text.
           */}
          <ul className="border-border bg-surface mt-5 overflow-hidden rounded-lg border">
            {branches.map((branch) => {
              const live = isOpenAt(branch, nowHere);

              return (
                <li
                  key={branch.id}
                  className="border-divider flex flex-wrap items-center gap-x-4.5 gap-y-1.5 border-b px-5.5 py-4.5 last:border-0 sm:flex-nowrap"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-base font-bold tracking-tight">
                      {branch.name}
                    </h3>
                    <p className="text-fg-subtle mt-0.5 text-[13px]">
                      {say(branch.address, locale as SiteLocale)}
                    </p>
                  </div>

                  <p data-num className="text-fg-muted flex-none text-[13px] sm:w-28">
                    {branch.opens === null || branch.closes === null
                      ? ''
                      : `${branch.opens} – ${branch.closes}`}
                  </p>

                  <p className="flex flex-none items-center gap-1.5 sm:w-28">
                    <span
                      aria-hidden
                      className={`size-[7px] flex-none rounded-full ${live ? 'bg-success-500' : 'bg-fg-disabled'}`}
                    />
                    <span
                      className={`text-[13px] font-semibold ${live ? 'text-success-700' : 'text-fg-subtle'}`}
                    >
                      {live ? t.home.open : t.home.closed}
                    </span>
                  </p>

                  {/*
                   * A `tel:` link, not a number to copy. On the device most of
                   * these are read on, the whole point of publishing a phone
                   * number is that it can be pressed.
                   */}
                  {branch.phone === null ? (
                    <span className="flex-none sm:w-[132px]" />
                  ) : (
                    <a
                      href={`tel:${branch.phone.replace(/[^+\d]/g, '')}`}
                      data-num
                      className="flex-none text-[13px] font-semibold sm:w-[132px] sm:text-right"
                    >
                      {branch.phone}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* ----------------------------------------------------------- about */}
        {/*
         * A teaser, not the section. About is a screen of its own now —
         * `dc.html:608-643` gives it three photo cards, five FAQ answers and
         * the contact block, and the two paragraphs that used to sit here were
         * the whole of it.
         */}
        <section data-sec id="about" className="site-wrap border-divider border-t">
          <h2 className="font-display text-3xl font-bold tracking-tight">{t.about.title}</h2>
          <p className="text-fg-muted mt-3 max-w-[64ch] text-[17px] leading-relaxed text-pretty">
            {aboutBody}
          </p>
          <Link
            href={`${here}/about?lang=${locale}`}
            className="text-acc mt-4 inline-block text-sm font-semibold"
          >
            {t.about.faq} →
          </Link>
        </section>
      </main>

      <SiteFooter
        locale={locale}
        name={name}
        branches={venue.branches}
        phone={venue.phone}
        telegram={venue.telegram}
        categories={(menu?.categories ?? []).map((category) => category.name)}
      />
    </>
  );
}
