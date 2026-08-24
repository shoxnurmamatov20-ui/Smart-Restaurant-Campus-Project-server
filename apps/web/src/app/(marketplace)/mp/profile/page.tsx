import { pathLocale } from '@/lib/server-locale';

import { guestLocale } from '../../../(guest)/guest-session';
import type { Lang } from '@restaurant/surfaces/mp/data';
import { getConsumer, PREF_DEFAULT } from '../../mp-server';
import { MpProfileBoard } from './profile-board';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'MyPOS', robots: { index: false, follow: false } };

/**
 * The customer's profile.
 *
 * It renders `MpChrome` like every other marketplace screen, and that is a fix
 * rather than a detail: this screen and `/mp/orders` were the two that did not,
 * so a customer who reached either from the dock lost the dock and had no way
 * back to the menu, the basket or the order they were tracking. The design puts
 * the dock on all five screens — `Ilova.dc.html:437-451`.
 *
 * The account is read here rather than in the board, because the board is a
 * client component and the credential is an httpOnly cookie it cannot see. Two
 * of the six rows need what comes back: whether Plus is running, and how the
 * four notification switches are set. `null` — no session, a refused token, an
 * API mid-restart — draws the design's sample profile with the defaults, which
 * is the same contract every read on this surface keeps.
 */
export default async function MpProfilePage() {
  const lang = guestLocale(await pathLocale(), null) as Lang;

  const consumer = await getConsumer();

  return (
    <MpProfileBoard
      lang={lang}
      basket="mp:guest"
      plusActive={consumer?.plus ?? false}
      prefs={consumer?.prefs ?? PREF_DEFAULT}
    />
  );
}
