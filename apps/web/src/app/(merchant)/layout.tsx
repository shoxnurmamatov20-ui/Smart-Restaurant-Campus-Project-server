import { cookies, headers } from 'next/headers';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import '../(dashboard)/app-shell.css';
/* The visible half of `data-demo` — six boards here set it and nothing drew
   it. See the file for why the rules select children rather than the wrapper. */
import './data-demo.css';
import { guestLocale } from '../(guest)/guest-session';
import type { Lang } from './merchant-data';
import { MerchantHeader } from './merchant-header';
import './merchant-shell.css';
import { MerchantRail } from './merchant-rail';
import { LOCALE_COOKIE } from '@/i18n/locale';
import { getSession } from '@/lib/session';

/**
 * The merchant panel — the marketplace's supply side.
 *
 * `GAPS.md K2` calls this the largest gap in the ecosystem and it is right: a
 * marketplace cannot launch one-sided, and none of it existed — no onboarding,
 * no dashboard, no catalogue, no settlement, no moderation, no dispatch.
 *
 * **Its own shell, not the restaurant console's.** A merchant on the
 * marketplace is a different relationship from a restaurant running its own
 * business, and the rail says so: three groups and seven rows, none of them the
 * twenty-four modules a tenant owns. The header carries the view's title and
 * the trading toggle, which is the one control reached for in a hurry.
 *
 * The whole panel reads one language, resolved here from the request and passed
 * down. It used to be hard-coded Uzbek in the rail and Uzbek strings inline in
 * the boards, which meant a Russian-speaking merchant got a Russian marketplace
 * and an Uzbek panel to run it from.
 *
 * There is no merchant role on the platform yet, so nothing signs into this.
 * `noindex` while that is true.
 *
 * **Whose shop it is comes from the session, not from the design file.** The
 * rail and the header printed "Osh Xona · Chilonzor · Toshkent" for every
 * reader, which on a signed-in owner's screen is another restaurant's name
 * above their own orders. Signed in, this is their restaurant and their venue;
 * signed out it is the demo's, and the demo is where those words belong.
 */
export const metadata: Metadata = {
  title: 'MyPOS — Merchant',
  robots: { index: false, follow: false },
};

export default async function MerchantLayout({ children }: { children: ReactNode }) {
  /*
   * The cookie first, `Accept-Language` second.
   *
   * The header now offers UZ · RU · EN, as the design draws it, and a control
   * whose choice is thrown away on the next navigation is worse than no control.
   * Same cookie the console writes, so somebody who works in both windows sets
   * their language once.
   */
  const jar = await cookies();
  const lang = guestLocale(
    jar.get(LOCALE_COOKIE)?.value,
    (await headers()).get('accept-language'),
  ) as Lang;
  /* Who this panel belongs to. `live: false` is the demo reader — no session,
     or an API that did not answer — and only then are the fixture's names the
     honest thing to draw. */
  const session = await getSession();
  const shop = session.live ? session.placeName : null;

  return (
    <div className="bg-bg-subtle text-fg text-md flex h-dvh overflow-hidden">
      <MerchantRail lang={lang} shop={shop} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <MerchantHeader lang={lang} shop={shop} />

        <main data-scroll className="min-h-0 flex-1 px-8 pt-6 pb-12">
          <div className="mx-auto max-w-[1320px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
