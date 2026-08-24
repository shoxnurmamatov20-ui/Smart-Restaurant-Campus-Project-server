import { pathLocale } from '@/lib/server-locale';
import { notFound } from 'next/navigation';

import { fetchGuestMenu } from '../../../../(guest)/guest-menu-server';
import { copyFor, guestLocale } from '../../../locale-bridge';
import { SiteFooter } from '../../../site-footer';
import { SiteHeader } from '../../../site-header';
import { VENUE } from '../../../venue-data';
import {
  fetchVenue,
  fetchCheckoutVenues,
  fetchOrderingRules,
  fetchSlotInstants,
} from '../../../venue-server';

import { CartScreen } from './cart-screen';

/**
 * The basket and the checkout.
 *
 * `noindex`, and that is not an oversight. Everything else on this site exists
 * to be found — the menu, the branches, the booking form — and a basket is a
 * private thing belonging to one visit. A crawler indexing it would list an
 * empty basket as a search result for the restaurant's name.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ restaurant: string }> }) {
  const { restaurant } = await params;
  const locale = guestLocale(await pathLocale(), null);
  const t = copyFor(locale).site;
  const menu = await fetchGuestMenu(restaurant, locale);

  return {
    title: `${t.cart.title} — ${menu?.restaurant?.name ?? VENUE.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function VenueCartPage({
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

  const [menu, venue, venues, slotInstants, rules] = await Promise.all([
    fetchGuestMenu(restaurant, locale),
    /* Contacts for the header and the footer — see `fetchVenue`. */
    fetchVenue(restaurant, '/cart'),
    /*
     * The venues, with the row ids an order names one by.
     *
     * Resolved on the server rather than in the checkout, because two of the
     * three things this list carries cannot be worked out in a browser: the
     * branch's `id` (which `GET /api/v1/public/site` deliberately does not
     * publish — a shop window has no business handing out primary keys) and the
     * pre-order sittings, which depend on the venue's own clock and would
     * otherwise differ between the server render and the hydration a second
     * later.
     */
    fetchCheckoutVenues(restaurant),
    /*
     * The instant behind each sitting.
     *
     * The labels the select draws are `19:00`; `scheduled_for` is a moment in
     * time. Converting one to the other needs the VENUE's clock, and doing it
     * in the browser would use the reader's — a guest in Berlin choosing 19:00
     * for a Termiz kitchen would book four hours after service.
     */
    fetchSlotInstants(restaurant),
    /* Which doors this site offers, and how far ahead it takes orders —
       `settings.site.channels` and `settings.site.preorder`, read from the
       published snapshot like everything else on this surface. */
    fetchOrderingRules(restaurant),
  ]);

  const name = menu?.restaurant?.name ?? VENUE.name;

  /*
   * A live restaurant that has published no branch.
   *
   * `fetchCheckoutVenues` used to hand back the design's five Tashkent and
   * Termiz venues here, complete with street addresses — and with no `apiId`,
   * so the "place order" button also failed silently. An empty list is now a
   * real answer and it gets a real sentence.
   */
  if (venues.length === 0) {
    return (
      <>
        <SiteHeader restaurant={restaurant} locale={locale} name={name} phone={venue.phone} />

        <main className="site-wrap py-16 text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight">{t.cart.noVenues}</h1>
          <p className="text-fg-muted mx-auto mt-3 max-w-[460px] text-sm leading-relaxed">
            {t.cart.noVenuesSub}
          </p>
        </main>

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

  return (
    <>
      <SiteHeader restaurant={restaurant} locale={locale} name={name} phone={venue.phone} />

      <CartScreen
        restaurant={restaurant}
        locale={locale}
        venues={venues}
        slotInstants={slotInstants}
        channels={rules.channels}
        /*
         * The two delivery numbers, from the venue rather than from the screen.
         * A restaurant that changes its free-delivery threshold changes it in
         * one place; a threshold written into the checkout would be a second
         * one to forget.
         */
        deliveryFee={VENUE.deliveryFee}
        freeFrom={VENUE.freeDeliveryOver}
        copy={{
          title: t.cart.title,
          sub: t.cart.sub,
          empty: t.cart.empty,
          emptySub: t.cart.emptySub,
          addMore: t.cart.addMore,
          how: t.cart.how,
          delivery: t.cart.delivery,
          pickup: t.cart.pickup,
          address: t.cart.address,
          flat: t.cart.flat,
          when: t.cart.when,
          asap: t.cart.asap,
          asapPlain: t.cart.asapPlain,
          readyIn: t.cart.readyIn,
          phone: t.cart.phone,
          /*
           * "Ism", borrowed from the booking form rather than added to the cart
           * section. `PublicOrderRequest` requires `customer.name` and the
           * design's checkout does not draw the field — see `CartScreen` — and
           * the one word for it already exists in this catalogue. A second key
           * saying the same thing is the drift `locale-bridge.ts` was written to
           * prevent.
           */
          name: t.book.name,
          /* What to say when the network, rather than the restaurant, refused. */
          offline: t.common.offline,
          payment: t.cart.payment,
          cash: t.cart.cash,
          card: t.cart.card,
          clickSub: t.cart.clickSub,
          paymeSub: t.cart.paymeSub,
          cashSub: t.cart.cashSub,
          promo: t.cart.promo,
          promoApply: t.cart.promoApply,
          promoOk: t.cart.promoOk,
          promoBad: t.cart.promoBad,
          summary: t.cart.summary,
          items: t.cart.items,
          discount: t.cart.discount,
          rounding: t.cart.rounding,
          total: t.cart.total,
          free: t.cart.free,
          vatNote: t.cart.vatNote,
          cashNote: t.cart.cashNote,
          feeFree: t.cart.feeFree,
          feePaid: t.cart.feePaid,
          place: t.cart.place,
          placeNote: t.cart.placeNote,
          placed: t.cart.placed,
          track: t.nav.track,
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
