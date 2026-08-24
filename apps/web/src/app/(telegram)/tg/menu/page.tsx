import { pathLocale } from '@/lib/server-locale';

import { guestTenant } from '@/lib/api-server';

import { fetchGuestMenu } from '../../../(guest)/guest-menu-server';
import { guestLocale } from '../../../(guest)/guest-session';
import { TgMenuBoard } from './menu-board';
import { TG } from '@restaurant/surfaces/tg/copy';
import type { Lang } from '@restaurant/surfaces/tg/data';
import { tgMenuFrom } from '@restaurant/surfaces/tg/live';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const lang = guestLocale(await pathLocale(), null) as Lang;

  return { title: TG.menu[lang] };
}

export default async function TelegramMenuPage() {
  const lang = guestLocale(await pathLocale(), null) as Lang;

  /*
   * The restaurant's own card — `GET /api/v1/public/menu`.
   *
   * The one endpoint this platform publishes to a stranger, and the same one
   * the QR code on the table and the restaurant site read. It needs no login:
   * the restaurant is named by `X-Tenant`, which `guestTenant()` resolves from
   * the host or from the build's default.
   *
   * `takeaway`, because the mini app can only place a collection order — it
   * has no address field and the bot's own knowledge of where a returning
   * guest lives is behind `initData`. Asking for the delivery channel would
   * price a menu against a lane this screen cannot check out on.
   */
  const tenant = await guestTenant();
  const menu = tenant === null ? null : await fetchGuestMenu(tenant, lang, 'takeaway');
  const card = menu === null ? null : tgMenuFrom(menu);

  /*
   * One basket per Telegram guest. Keyed by the restaurant only for now — the
   * Telegram id would be the right key and it arrives in `initData`, which
   * nothing verifies yet. A shared key here is honest for a single-tenant demo
   * and wrong the moment two restaurants share a browser; the TODO in
   * `layout.tsx` owns it.
   */
  return (
    <TgMenuBoard
      lang={lang}
      basket={`tg:${tenant ?? 'demo'}`}
      categories={card?.categories}
      dishes={card?.dishes}
      /*
       * `menu.live` and not "did the fetch return": `fetchGuestMenu` answers
       * `null` on a refusal, and a restaurant that has published nothing is a
       * different, honest state — an empty card rather than the design's ten
       * dishes at the demo's prices.
       */
      live={menu?.live ?? false}
    />
  );
}
