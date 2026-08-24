import { getLocale, getTranslations } from 'next-intl/server';

import { moduleMetadata } from '../module-page';
import { MarketingScreen } from './marketing-panels';
import { getMarketing } from './marketing-server';
import type { Lang } from './marketing-data';

export const generateMetadata = () => moduleMetadata('marketing');

/**
 * Campaigns, promotions, loyalty and automated messages —
 * `Smart Restaurant OS.dc.html:2826-3003`.
 *
 * The screen's argument is the composer on the campaigns tab. SMS costs real
 * money per message here, so "reaches 2 148 people" is not a plan; 2 148 people
 * at 55 so'm a part, needing 14 orders' margin to break even, is. The design
 * puts that sum next to the send button rather than in a report afterwards, and
 * that is the whole difference between a marketing screen and a send box.
 *
 * An earlier build drew coupons and segments as top-level sections. The design
 * has neither: segments are the composer's audience picker, and coupons live
 * inside promotions. Both are here, in the places the file puts them.
 *
 * Three of the four tabs are live through `./marketing-server.ts`. The loyalty
 * tab is not, and for a different reason than the others ever were: tiers and
 * the points liability are a report over `crm.loyalty_transactions` rather than
 * a table of their own, and that report has no endpoint.
 */
export default async function MarketingPage() {
  const [t, locale, board] = await Promise.all([
    getTranslations('console.marketing'),
    getLocale(),
    // The API when there is a session, the fixtures when there is not.
    getMarketing(),
  ]);

  return (
    <MarketingScreen lang={locale as Lang} title={t('title')} subtitle={t('sub')} board={board} />
  );
}
