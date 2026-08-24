import { pathLocale } from '@/lib/server-locale';

import { guestLocale } from '../../../(guest)/guest-session';
import type { Lang } from '../../merchant-data';
import { getMerchantCatalogue } from '../../merchant-server';
import { MerchantCatalogueBoard } from './catalogue-board';

export const dynamic = 'force-dynamic';

export default async function MerchantCataloguePage() {
  const lang = guestLocale(await pathLocale(), null) as Lang;

  const { dishes, categories, commissionPercent, live } = await getMerchantCatalogue();

  return (
    <MerchantCatalogueBoard
      lang={lang}
      dishes={dishes}
      categories={categories}
      /* The rate the API named, never the design's constant — the margin column
         is the figure a merchant prices against. */
      commissionPercent={commissionPercent}
      live={live}
    />
  );
}
