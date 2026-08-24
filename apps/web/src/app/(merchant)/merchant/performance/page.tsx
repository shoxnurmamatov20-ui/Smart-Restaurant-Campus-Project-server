import { pathLocale } from '@/lib/server-locale';

import { guestLocale } from '../../../(guest)/guest-session';
import type { Lang } from '../../merchant-data';
import { PerformancePanel } from '../../merchant-panels';
import { getMerchantPerformance } from '../../merchant-server';

export const dynamic = 'force-dynamic';

export default async function MerchantPerformancePage() {
  const lang = guestLocale(await pathLocale(), null) as Lang;

  /* The thirty-day window, or null when the API did not answer — which is the
     only case the design's fixture funnel is drawn for. */
  const perf = await getMerchantPerformance();

  return <PerformancePanel lang={lang} perf={perf} />;
}
