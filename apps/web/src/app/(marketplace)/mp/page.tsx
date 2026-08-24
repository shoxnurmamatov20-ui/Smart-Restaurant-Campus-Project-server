import { pathLocale } from '@/lib/server-locale';

import { guestLocale } from '../../(guest)/guest-session';
import type { Lang } from '@restaurant/surfaces/mp/data';
import { readAppManifest } from '@/app/(marketing)/download/download-server';

import { getStores } from '../mp-server';
import { MpHomeBoard } from './home-board';

export const dynamic = 'force-dynamic';

export default async function MarketplaceHomePage() {
  const lang = guestLocale(await pathLocale(), null) as Lang;

  /*
   * The directory, live. No token and no `X-Tenant`: this is the one read on
   * the platform that spans every restaurant, and `mp-server.ts` explains why
   * neither of the shared readers could make it.
   *
   * `getStores()` answers the fixture only when the API did not answer at all,
   * so the page renders either way — a marketplace that 500s while one
   * restaurant's API restarts would take forty shops off the internet. An
   * empty live directory stays empty and the board says so.
   */
  const { stores } = await getStores();

  return (
    <MpHomeBoard
      lang={lang}
      basket="mp:guest"
      apkHref={readAppManifest()?.url ?? null}
      stores={stores}
    />
  );
}
