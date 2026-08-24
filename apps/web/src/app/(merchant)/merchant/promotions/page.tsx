import { pathLocale } from '@/lib/server-locale';

import { guestLocale } from '../../../(guest)/guest-session';
import type { Lang } from '../../merchant-data';
import { getMerchantPlacements, getMerchantPromotions } from '../../merchant-server';
import { PromotionsBoard } from './promotions-board';

export const dynamic = 'force-dynamic';

/**
 * Two reads, side by side.
 *
 * The campaigns and the advertising rate card are different endpoints and one
 * can answer while the other cannot — a restaurant with no promotions still
 * has slots to buy. `Promise.all` rather than two awaits so the slower of the
 * two decides the render, not their sum: this screen is behind a rail click and
 * a merchant pressing "Aksiyalar" is already waiting.
 */
export default async function MerchantPromotionsPage() {
  const lang = guestLocale(await pathLocale(), null) as Lang;

  const [{ promotions, live }, { slots }] = await Promise.all([
    getMerchantPromotions(),
    getMerchantPlacements(),
  ]);

  return <PromotionsBoard lang={lang} promotions={promotions} slots={slots} live={live} />;
}
