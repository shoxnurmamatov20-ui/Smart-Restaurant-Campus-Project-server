import { pathLocale } from '@/lib/server-locale';

import { guestLocale } from '../../../(guest)/guest-session';
import type { Lang } from '../../merchant-data';
import { getMerchantPayout, getMerchantSettlements } from '../../merchant-server';
import { SettlementBoard } from './settlement-board';

export const dynamic = 'force-dynamic';

/**
 * The history and the account it pays into, read side by side.
 *
 * Two endpoints because they are two different facts and either can be missing:
 * a restaurant with no statements yet still has bank details to check, and one
 * with six weeks of history may never have filled the account in — which is
 * exactly the case the payout state exists to make visible.
 */
export default async function MerchantSettlementPage() {
  const lang = guestLocale(await pathLocale(), null) as Lang;

  const [{ rows, pending, live }, payout] = await Promise.all([
    getMerchantSettlements(),
    getMerchantPayout(),
  ]);

  return <SettlementBoard lang={lang} rows={rows} pending={pending} payout={payout} live={live} />;
}
