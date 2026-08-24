import { pathLocale } from '@/lib/server-locale';
import { notFound } from 'next/navigation';

import { fetchGuestMenu } from '../../../../(guest)/guest-menu-server';
import { copyFor, guestLocale } from '../../../locale-bridge';
import { fetchVenue } from '../../../venue-server';
import { SiteFooter } from '../../../site-footer';
import { SiteHeader } from '../../../site-header';
import { PAYMENT_RAILS, railLabel, VENUE } from '../../../venue-data';
import { TrackScreen } from './track-screen';

/** `noindex`, for the same reason as the basket: this belongs to one visit. */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ restaurant: string }> }) {
  const { restaurant } = await params;
  const locale = guestLocale(await pathLocale(), null);
  const t = copyFor(locale).site;
  const menu = await fetchGuestMenu(restaurant, locale);

  return {
    title: `${t.track.title} — ${menu?.restaurant?.name ?? VENUE.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function VenueTrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurant: string }>;
  searchParams: Promise<{ lang?: string; demo?: string }>;
}) {
  const { restaurant } = await params;
  const { lang, demo } = await searchParams;

  if (restaurant === '') notFound();

  const locale = guestLocale(lang ?? (await pathLocale()), null);
  const t = copyFor(locale).site;
  const [menu, venue] = await Promise.all([
    fetchGuestMenu(restaurant, locale),
    /* Contacts for the header and the footer — see `fetchVenue`. */
    fetchVenue(restaurant, '/track'),
  ]);
  const name = menu?.restaurant?.name ?? VENUE.name;

  return (
    <>
      <SiteHeader restaurant={restaurant} locale={locale} name={name} phone={venue.phone} />

      <TrackScreen
        restaurant={restaurant}
        locale={locale}
        /*
         * The design's own order, and only for a reader who asked for it.
         *
         * Without it the whole screen below the empty state is unreachable
         * unless the reader buys lunch, which is how it came to ship with a
         * hard-coded `false` in front of it and nobody noticing for a release.
         */
        demo={demo === '1'}
        copy={{
          title: t.track.title,
          sub: t.track.sub,
          pending: t.track.pending,
          about: t.track.about,
          delivered: t.track.delivered,
          order: t.track.order,
          total: t.track.total,
          paid: t.track.paid,
          call: t.track.call,
          courierMeta: t.track.courierMeta,
          advance: t.track.advance,
          /*
           * Every rail's name, resolved here where the catalogue is.
           *
           * The screen picks the one the order was paid with. The catalogue's
           * sentence carries a `{rail}` hole rather than the word "card" — the
           * design's fixture is always a card and a real order is not, and
           * Russian cannot build "картой" from "Карта" by joining two strings.
           */
          rails: Object.fromEntries(
            PAYMENT_RAILS.map((rail) => [
              rail.id,
              railLabel(rail.id, { card: t.cart.card, cash: t.cart.cash }),
            ]),
          ),
          steps: [
            t.track.steps.received,
            t.track.steps.confirmed,
            t.track.steps.cooking,
            t.track.steps.courier,
            t.track.steps.delivered,
          ],
          none: t.track.none,
          noneSub: t.track.noneSub,
          toMenu: t.nav.menu,
          stillInCart: t.cart.sub,
        }}
      />

      <SiteFooter
        locale={locale}
        name={name}
        branches={venue.branches}
        phone={venue.phone}
        telegram={venue.telegram}
      />
    </>
  );
}
