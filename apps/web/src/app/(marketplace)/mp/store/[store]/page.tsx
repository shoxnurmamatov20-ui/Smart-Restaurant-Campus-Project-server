import { pathLocale } from '@/lib/server-locale';
import { notFound } from 'next/navigation';

import { guestLocale } from '../../../../(guest)/guest-session';
import { storeById, type Lang } from '@restaurant/surfaces/mp/data';

import { getStore } from '../../../mp-server';
import { MpStoreBoard } from './store-board';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ store: string }> }) {
  const { store } = await params;

  return { title: storeById(store)?.name ?? 'MyPOS' };
}

export default async function MarketplaceStorePage({
  params,
}: {
  params: Promise<{ store: string }>;
}) {
  const { store } = await params;

  /*
   * The live storefront first, the fixture only if the API cannot answer.
   *
   * The order matters: a slug the API knows nothing about is a 404, and a slug
   * the API cannot be ASKED about — because it is restarting — falls back to
   * the sample shop rather than telling a guest the restaurant has closed.
   */
  const { store: live, menu } = await getStore(store);
  const found = live ?? storeById(store);

  if (found === undefined || found === null) notFound();

  const lang = guestLocale(await pathLocale(), null) as Lang;

  /*
   * One basket per merchant. A marketplace basket that mixed two restaurants
   * would be an order two kitchens have to cook and one courier has to collect
   * from both — which is a product decision nobody has made, so the key keeps
   * them apart until somebody does.
   */
  return <MpStoreBoard lang={lang} basket={`mp:${store}`} store={found} menu={menu} />;
}
