import { pathLocale } from '@/lib/server-locale';

import { guestLocale } from '../../../(guest)/guest-session';
import type { Lang } from '@restaurant/surfaces/mp/data';
import { MpCartBoard } from './cart-board';

export const dynamic = 'force-dynamic';

export default async function MarketplaceCartPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { store } = await searchParams;
  const lang = guestLocale(await pathLocale(), null) as Lang;

  /*
   * The merchant comes off the query when the guest arrived from a store page,
   * and falls back to the demo one otherwise. When there is a backend the
   * open basket is a server fact and this parameter goes away.
   */
  return <MpCartBoard lang={lang} basket={`mp:${store ?? 'osh-xona'}`} />;
}
