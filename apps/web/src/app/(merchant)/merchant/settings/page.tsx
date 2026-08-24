import { pathLocale } from '@/lib/server-locale';

import { guestLocale } from '../../../(guest)/guest-session';
import type { Lang } from '../../merchant-data';
import { StoreSettingsPanel } from '../../merchant-panels';
import { getMerchantSettings } from '../../merchant-server';

export const dynamic = 'force-dynamic';

export default async function MerchantSettingsPage() {
  const lang = guestLocale(await pathLocale(), null) as Lang;

  /* This seller's own row, or null when the API did not answer — which is the
     only case the design's transcription is drawn for. */
  const settings = await getMerchantSettings();

  return <StoreSettingsPanel lang={lang} settings={settings} />;
}
