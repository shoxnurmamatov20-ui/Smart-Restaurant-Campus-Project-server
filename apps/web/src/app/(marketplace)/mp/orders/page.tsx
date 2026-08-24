import { pathLocale } from '@/lib/server-locale';

import { guestLocale } from '../../../(guest)/guest-session';
import type { Lang } from '@restaurant/surfaces/mp/data';
import { getMyOrders } from '../../mp-server';
import { MpOrdersBoard } from './orders-board';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'MyPOS', robots: { index: false, follow: false } };

/**
 * The customer's order history.
 *
 * It renders `MpChrome` like every other marketplace screen — this one and
 * `/mp/profile` were the two that did not, so a customer who reached either
 * from the dock lost the dock and had nowhere to go. The design carries it on
 * all five — `Ilova.dc.html:437-451`.
 *
 * The rows are the customer's own when there is a session — `getMyOrders()`
 * reads them across every restaurant they have ordered from, because that is
 * what a marketplace history is. Without one, or with the API unreachable, the
 * design's four sample rows stand in and the board marks them.
 */
export default async function MpOrdersPage() {
  const lang = guestLocale(await pathLocale(), null) as Lang;
  const { orders, live } = await getMyOrders();

  return <MpOrdersBoard lang={lang} basket="mp:guest" orders={orders} live={live} />;
}
