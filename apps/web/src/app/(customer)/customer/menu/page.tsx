import { cookies, headers } from 'next/headers';

import { customerLang, langCookie } from '../../customer-session';
import { fetchCustomerMenu } from '../../customer-server';
import { MenuBoard } from './menu-board';

/**
 * The menu, and the dish sheet that opens over it.
 *
 * The server resolves the language and hands over; everything after that —
 * searching, filtering, choosing a size, adding to the basket — happens on the
 * phone. The catalogue is a few kilobytes and a guest scrolling it on a café's
 * Wi-Fi should not wait for a round trip per keystroke.
 *
 * The catalogue comes from `GET /api/v1/public/menu` — the one endpoint the
 * platform publishes to the public, and the same one the QR menu and the
 * restaurant site read. The restaurant is named by the build
 * (`NEXT_PUBLIC_DEFAULT_TENANT`) rather than by a session, because a customer
 * browsing before they sign in is a stranger. When the API does not answer the
 * screen draws the fixtures and says so — see `customer-server.ts`.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Menyu' };

export default async function CustomerMenuPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; d?: string }>;
}) {
  const lang = customerLang((await headers()).get('accept-language'), langCookie(await cookies()));
  const { c, d } = await searchParams;
  const menu = await fetchCustomerMenu(lang);

  return <MenuBoard lang={lang} initialCategory={c ?? null} initialDish={d ?? null} menu={menu} />;
}
