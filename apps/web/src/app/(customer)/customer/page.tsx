import { cookies, headers } from 'next/headers';

import { CustomerDock } from '../customer-dock';
import { copy, HOME, MENU, SHARED } from '@restaurant/surfaces/customer/copy';
import { customerLang, langCookie } from '../customer-session';
import { fetchCustomerMenu, fetchCustomerVenues } from '../customer-server';
import { HomeBoard } from './home-board';

/**
 * The customer app's home — a menu with a shop above it.
 *
 * At `/customer` rather than at the root: a route group adds no path segment, so
 * `(customer)/page.tsx` and `(marketing)/page.tsx` would both resolve to `/` and
 * Next refuses to build. The marketing site owns the root — it is what a domain
 * visitor should land on — and the customer app is a place you go.
 *
 * The design opens on the restaurant rather than on a dish list, and the order it
 * puts things in is the order a returning customer needs them: where they are
 * collecting from, how the food gets to them, what is on this week, then the
 * categories, then what everyone else is ordering. A bare category grid would be
 * a menu; this is a shop.
 *
 * This file is now the shell — copy resolution, the dock, the metadata. The
 * screen itself is `home-board.tsx`, because three of its controls are stateful
 * and used to be drawn as text that did nothing.
 *
 * **Live, and it says so when it is not.** This screen used to draw `DISHES`
 * and `BRANCHES` from the fixtures on the ground that no customer-facing
 * catalogue endpoint existed. One did — `/customer/menu` had already been wired
 * to it — so a customer read four dishes a restaurant had never priced and
 * picked between five venues it does not have, on the screen the app opens on.
 * Both reads fall back to the same fixtures when the API does not answer, and
 * `live: false` travels with them so the board can say which it is drawing.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Osh Xona' };

export default async function CustomerHomePage() {
  const lang = customerLang((await headers()).get('accept-language'), langCookie(await cookies()));
  const t = copy(HOME, lang);
  const s = copy(SHARED, lang);
  const m = copy(MENU, lang);
  // Both in one round trip: the categories under the fold and the venue chip at
  // the top of it are the same screen, and two awaits would be two paints.
  const [menu, venues] = await Promise.all([fetchCustomerMenu(lang), fetchCustomerVenues(lang)]);

  return (
    <>
      <main className="flex-1 pb-6">
        <HomeBoard
          lang={lang}
          menu={menu}
          venues={venues}
          words={{
            search: s.search,
            delivery: s.delivery,
            pickup: s.pickup,
            deliveryNote: t.deliveryNote,
            pickupNote: t.pickupNote,
            promoTag: t.promoTag,
            promoHeading: t.promoHeading,
            promoNote: t.promoNote,
            categories: t.categories,
            seeAll: t.seeAll,
            popular: t.popular,
            popularNote: t.popularNote,
            /* The strip's own line is "2 480 ball · 3 kupon" in the design; the
               number is the customer's and the words are the catalogue's. */
            loyalty: `2 480 ${t.loyaltyStrip}`,
            loyaltyNote: t.loyaltyStripNote,
            open: s.open,
            minutes: s.minutes,
            km: 'km',
            countUnit: t.countUnit,
            soldOut: s.soldOut,
            noHits: m.noHitsHeading,
            openHours: t.openHours,
          }}
        />
      </main>

      <CustomerDock lang={lang} />
    </>
  );
}
