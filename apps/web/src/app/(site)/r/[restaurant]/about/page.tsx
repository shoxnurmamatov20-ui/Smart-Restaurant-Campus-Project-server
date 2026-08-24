import { pathLocale } from '@/lib/server-locale';
import { notFound } from 'next/navigation';

import { copyFor, fill, guestLocale } from '../../../../(guest)/guest-session';
import { fetchGuestMenu } from '../../../../(guest)/guest-menu-server';
import { SOCIALS, VENUE, say, type SiteLocale } from '../../../venue-data';
import { fetchVenue } from '../../../venue-server';
import { SiteFooter } from '../../../site-footer';
import { SiteHeader } from '../../../site-header';
import { SitePhoto } from '../../../site-photo';

export const dynamic = 'force-dynamic';

/**
 * About the restaurant — `dc.html:608-643`.
 *
 * A screen, not the two paragraphs anchored at the bottom of the home page that
 * used to stand for it. What is on it is what a stranger asks before they order
 * from somewhere they have never been: who cooks, what the room is like, where
 * the food comes from, and the five questions that otherwise get typed into the
 * Telegram bot one at a time.
 *
 * ---------------------------------------------------------------------------
 * The FAQ is `<details>`, not React state
 *
 * The accordion is the design's, but it is built out of the element the browser
 * already has: `<details name="faq">` gives the exclusive behaviour — opening
 * one closes the others — with no JavaScript, which matters twice here. It is
 * the page most likely to be read on a slow connection before hydration, and it
 * is the page a crawler reads for the answers themselves. An accordion built on
 * `useState` hides all five answers from both.
 */
export async function generateMetadata({ params }: { params: Promise<{ restaurant: string }> }) {
  const { restaurant } = await params;
  const locale = guestLocale(await pathLocale(), null);
  const t = copyFor(locale).site;
  const [menu, venue] = await Promise.all([
    fetchGuestMenu(restaurant, locale),
    /* This restaurant's own branches and contacts. The screen used to print
       `BRANCHES`, `VENUE.phone` and `VENUE.telegram` — the demo's five venues
       and the demo's number — on every restaurant's own about page. */
    fetchVenue(restaurant, '/about'),
  ]);
  const name = menu?.restaurant?.name ?? venue.name;

  return {
    title: `${t.about.title} — ${name}`,
    // The restaurant's own words in the search snippet, not the demo's story.
    description: venue.live
      ? venue.about !== null && venue.about.trim() !== ''
        ? venue.about
        : fill(t.about.unwritten, { name })
      : t.about.body,
    alternates: { canonical: `/r/${encodeURIComponent(restaurant)}/about` },
  };
}

export default async function VenueAboutPage({
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
    /* This restaurant's own branches and contacts. The screen used to print
       `BRANCHES`, `VENUE.phone` and `VENUE.telegram` — the demo's five venues
       and the demo's number — on every restaurant's own about page. */
    fetchVenue(restaurant, '/about'),
  ]);
  const name = menu?.restaurant?.name ?? venue.name;
  const flagship = venue.branches[0] ?? null;
  /* What the restaurant wrote about itself; the demo's paragraph only on the demo. */
  const aboutBody = venue.live
    ? venue.about !== null && venue.about.trim() !== ''
      ? venue.about
      : fill(t.about.unwritten, { name })
    : t.about.body;

  return (
    <>
      {/*
       * The FAQ, as markup a search result can be built from.
       *
       * The same five answers a reader gets, declared once more in the shape
       * Google reads. Without it "is delivery free at Osh Xona" is answered by
       * whichever aggregator wrote a page about the restaurant; with it, it is
       * answered by the restaurant.
       */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: t.about.questions.map((entry) => ({
              '@type': 'Question',
              name: entry.q,
              acceptedAnswer: { '@type': 'Answer', text: entry.a },
            })),
          }).replace(/</g, '\\u003c'),
        }}
      />

      <SiteHeader restaurant={restaurant} locale={locale} name={name} phone={venue.phone} />

      <main>
        <section data-sec className="site-wrap">
          <h1 className="font-display text-4xl font-extrabold tracking-tight">{t.about.title}</h1>
          <p className="text-fg-muted mt-2.5 max-w-[66ch] text-[17px] leading-relaxed text-pretty">
            {aboutBody}
          </p>

          {/*
           * The three cards are the demo's story — one cook since 2014, the
           * morning market run. They stay on the demo's page and nowhere
           * else: a restaurant's own story is the `about` it writes under
           * /settings/site, and until it does the page says less rather than
           * somebody else's truth.
           */}
          <ul data-3up className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(venue.live ? [] : t.about.cards).map((card) => (
              <li
                key={card.head}
                className="border-border bg-surface overflow-hidden rounded-lg border"
              >
                {/*
                 * A tinted panel, and it stays one.
                 *
                 * The dish photographs come from the menu endpoint; a
                 * restaurant's room, its cook and its market run do not come
                 * from anywhere yet, and putting a plate of food under "Hall,
                 * terrace and private room" would be a caption that lies.
                 */}
                <SitePhoto image={null} alt="" className="!aspect-auto h-[190px] !rounded-none" />

                <div className="px-5.5 pt-4.5 pb-5.5">
                  <h2 className="font-display text-[17px] font-bold tracking-tight">{card.head}</h2>
                  <p className="text-fg-muted mt-1.5 text-sm leading-relaxed">{card.body}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="border-border bg-surface mt-6 rounded-lg border px-7 py-6.5">
            <h2 className="font-display text-xl font-bold tracking-tight">{t.about.faq}</h2>

            <div className="mt-3">
              {t.about.questions.map((entry) => (
                <details key={entry.q} name="faq" className="border-divider group border-b">
                  <summary className="flex cursor-pointer items-center justify-between gap-3.5 py-4 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
                    <span>{entry.q}</span>
                    {/*
                     * The design's + and −, drawn by CSS rather than swapped in
                     * JavaScript: `group-open` follows the element's own state,
                     * so the sign is right on the server's first paint too.
                     */}
                    <span
                      aria-hidden
                      className="text-fg-subtle flex-none text-lg font-normal group-open:hidden"
                    >
                      +
                    </span>
                    <span
                      aria-hidden
                      className="text-fg-subtle hidden flex-none text-lg font-normal group-open:block"
                    >
                      −
                    </span>
                  </summary>

                  <p className="text-fg-muted max-w-[72ch] pb-4 text-sm leading-relaxed">
                    {entry.a}
                  </p>
                </details>
              ))}
            </div>
          </div>

          {/* -------------------------------------------------------- contact */}
          <div className="border-border bg-surface mt-6 rounded-lg border px-7 py-6.5">
            <h2 className="font-display text-xl font-bold tracking-tight">{t.about.contact}</h2>

            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <ul data-num className="grid gap-2.5 text-sm">
                {/* Each row only when this restaurant published it. */}
                {venue.phone === null ? null : (
                  <li>
                    <a href={`tel:${venue.phone.replace(/[^+\d]/g, '')}`} className="font-semibold">
                      {venue.phone}
                    </a>
                  </li>
                )}
                {venue.live ? null : (
                  <li>
                    <a href={`mailto:${VENUE.email}`} className="text-fg-muted">
                      {VENUE.email}
                    </a>
                  </li>
                )}
                {venue.telegram === null ? null : (
                  <li>
                    <a
                      href={`https://${venue.telegram}`}
                      rel="noreferrer"
                      className="text-fg-muted"
                    >
                      {venue.telegram}
                    </a>
                  </li>
                )}
                {flagship === null || flagship.opens === null || flagship.closes === null ? null : (
                  <li className="text-fg-muted">
                    {fill(t.footer.hours, { from: flagship.opens, to: flagship.closes })}
                  </li>
                )}
              </ul>

              {/*
               * Delivery zones, told as the branch list rather than as a map.
               *
               * The design's zones are a drawing; this product has no polygon
               * to render one from, and a map with a made-up boundary on it is
               * a promise about an address the courier has never been to. The
               * five branches and their districts are the honest version of the
               * same answer.
               */}
              <ul className="text-fg-muted grid gap-2.5 text-sm">
                {venue.branches.map((branch) => (
                  <li key={branch.id}>
                    <span className="text-fg font-semibold">{branch.name}</span> ·{' '}
                    {say(branch.address, locale as SiteLocale)}
                  </li>
                ))}
              </ul>
            </div>

            <ul className="mt-5 flex gap-2.5">
              {SOCIALS.map((social) => (
                <li key={social.id}>
                  <a
                    href={social.href}
                    rel="noreferrer"
                    aria-label={social.label}
                    className="border-border text-fg-muted grid size-[38px] place-items-center rounded-md border"
                  >
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d={social.icon} />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          </div>
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
