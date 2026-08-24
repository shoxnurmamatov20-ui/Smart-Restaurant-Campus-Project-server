import { pathLocale } from '@/lib/server-locale';

import { guestLocale } from '../../../(guest)/guest-session';
import type { Lang } from '../../merchant-data';
import { getMerchantQueue } from '../../merchant-server';
import { MerchantOrdersBoard } from './orders-board';

export const dynamic = 'force-dynamic';

export default async function MerchantOrdersPage() {
  const lang = guestLocale(await pathLocale(), null) as Lang;

  /*
   * `all` rather than `new`, because this screen carries its own four filters
   * and switching between them must not be a round trip — a merchant flipping
   * to "done" mid-service is checking one thing and going straight back.
   */
  const { orders, live } = await getMerchantQueue('all');

  return <MerchantOrdersBoard lang={lang} orders={orders} live={live} />;
}
