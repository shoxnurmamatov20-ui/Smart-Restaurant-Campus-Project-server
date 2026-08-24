import { pathLocale } from '@/lib/server-locale';
import { notFound } from 'next/navigation';

import { copyFor, guestLocale } from '../../../../guest-session';
import { RatingBoard } from './rating-board';

/**
 * After paying: the receipt line, then the rating.
 *
 * In that order because it is the order the guest cares about. The first thing
 * somebody who has just paid wants is confirmation that they have; the rating is
 * a favour they may or may not do, and putting it above the confirmation reads
 * as a toll gate.
 *
 * What was paid arrives in the query string rather than in state — the bill
 * screen put it there — so the receipt line survives a reload on a phone left
 * face-up on a table.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ restaurant: string }> }) {
  const { restaurant } = await params;

  return { title: restaurant, robots: { index: false, follow: false } };
}

export default async function GuestRatingPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurant: string; table: string }>;
  searchParams: Promise<{ lang?: string; paid?: string; rail?: string }>;
}) {
  const { restaurant, table } = await params;
  const { lang, paid, rail } = await searchParams;

  if (restaurant === '' || table === '') notFound();

  const locale = guestLocale(lang ?? (await pathLocale()), null);

  /*
   * A missing or malformed amount becomes null rather than NaN or zero. The
   * screen then omits the receipt line entirely — a guest who reached this URL
   * directly has not paid anything, and "0 so'm paid" is a worse answer than no
   * answer.
   */
  const parsed = Number.parseInt(paid ?? '', 10);
  const amount = Number.isFinite(parsed) && parsed > 0 ? parsed : null;

  return (
    <RatingBoard
      locale={locale}
      copy={copyFor(locale)}
      paid={amount}
      railId={rail ?? null}
      /*
       * The sticker names the restaurant, and one host serves every
       * restaurant's stickers — so the review has to carry the slug rather than
       * letting the server guess it from the host and file it against the
       * deployment's default tenant.
       */
      restaurant={restaurant}
      table={table}
      here={`/qr/${encodeURIComponent(restaurant)}/${encodeURIComponent(table)}`}
    />
  );
}
