import { pathLocale } from '@/lib/server-locale';

import { guestLocale } from '../../../(guest)/guest-session';
import type { Lang } from '../../merchant-data';
import { getMerchantDisputes } from '../../merchant-server';
import { DisputesBoard } from './disputes-board';

export const dynamic = 'force-dynamic';

export default async function MerchantDisputesPage() {
  const lang = guestLocale(await pathLocale(), null) as Lang;

  const { disputes, live } = await getMerchantDisputes();

  return <DisputesBoard lang={lang} disputes={disputes} live={live} />;
}
