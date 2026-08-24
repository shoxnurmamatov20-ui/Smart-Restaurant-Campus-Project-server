import { pathLocale } from '@/lib/server-locale';
import { notFound } from 'next/navigation';

import { copyFor, guestLocale } from '../../../../guest-session';
import { fetchTableOrder } from '../../../../guest-table-server';
import { BillBoard } from './bill-board';

/**
 * The bill, and the only screen on this surface that would move money.
 *
 * It still does not move any, and that is the platform's shape rather than this
 * screen's: taking a card is Finance's, through the till. What the button does
 * do now is the thing a guest at a table actually asks for —
 * `POST /public/tables/{token}/pay` raises a `bill` call on
 * `branch.{id}.floor` and moves the bill to `topay`, so a waiter walks over
 * with a terminal and every screen in the building draws the table as waiting
 * rather than eating. `qr.common.demoPayment` stays under the button, because
 * the half that is still a demonstration is the half about money.
 *
 * The figures are the bill's own: `GET /public/tables/{token}/order` answers the
 * lines and `pricing.ts` — a transcription of the server's `BillTotals` — adds
 * them up, so what a guest reads here is what the till would print. An API that
 * does not answer falls back to the fixture, as every screen on this surface
 * does.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ restaurant: string }> }) {
  const { restaurant } = await params;

  return { title: restaurant, robots: { index: false, follow: false } };
}

export default async function GuestBillPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurant: string; table: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { restaurant, table } = await params;
  const { lang } = await searchParams;

  if (restaurant === '' || table === '') notFound();

  const locale = guestLocale(lang ?? (await pathLocale()), null);
  const live = await fetchTableOrder(restaurant, table, locale);

  return (
    <BillBoard
      locale={locale}
      copy={copyFor(locale)}
      here={`/qr/${encodeURIComponent(restaurant)}/${encodeURIComponent(table)}`}
      order={live.order}
      payHref={`/qr/${encodeURIComponent(restaurant)}/${encodeURIComponent(table)}/service/pay?lang=${locale}`}
    />
  );
}
