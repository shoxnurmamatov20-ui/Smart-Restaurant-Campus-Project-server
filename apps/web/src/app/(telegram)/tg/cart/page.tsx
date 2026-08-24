import { pathLocale } from '@/lib/server-locale';

import { guestTenant } from '@/lib/api-server';

import { guestLocale } from '../../../(guest)/guest-session';
import { TG } from '@restaurant/surfaces/tg/copy';
import type { Lang } from '@restaurant/surfaces/tg/data';
import { TgCartBoard } from './cart-board';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const lang = guestLocale(await pathLocale(), null) as Lang;

  return { title: TG.cart[lang] };
}

export default async function TelegramCartPage() {
  const lang = guestLocale(await pathLocale(), null) as Lang;

  /* The same key the menu writes into — one basket per restaurant, resolved
     the same way, or the two screens would each hold half an order. */
  const tenant = await guestTenant();

  return <TgCartBoard lang={lang} basket={`tg:${tenant ?? 'demo'}`} />;
}
