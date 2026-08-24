import { pathLocale } from '@/lib/server-locale';
import { notFound } from 'next/navigation';

import { copyFor, guestLocale } from '../../../../guest-session';
import { fetchGuestMenu } from '../../../../guest-menu-server';
import { GuestMenuBoard } from './menu-board';

/**
 * The menu, as a guest reads it at the table.
 *
 * Rendered on the server and handed to a client board, the same split the kitchen
 * display uses: the words and the dishes are resolved where the API token lives,
 * and the searching and filtering happen on the phone. A menu that went back to
 * the server for every keystroke would be unusable on café Wi-Fi, and the whole
 * catalogue is a few kilobytes.
 *
 * `live: false` means the API did not answer and these are fixtures. The board
 * says so rather than hiding it — a phone quoting a price the kitchen never set
 * is worse than a phone admitting it is offline.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ restaurant: string }> }) {
  const { restaurant } = await params;

  return { title: restaurant, robots: { index: false, follow: false } };
}

export default async function GuestMenuPage({
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
  const menu = await fetchGuestMenu(restaurant, locale);

  if (menu === null) {
    // Nothing to draw and nothing to pretend. The entry card already told the
    // guest the server did not answer; repeating it here with an empty menu
    // underneath would look like a restaurant with no food.
    const t = copyFor(locale);

    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
        <p className="text-md font-semibold">{t.qr.menu.empty}</p>
        <p className="text-fg-subtle text-sm">{t.qr.common.offline}</p>
      </main>
    );
  }

  return (
    <GuestMenuBoard
      menu={menu}
      locale={locale}
      copy={copyFor(locale)}
      back={`/qr/${encodeURIComponent(restaurant)}/${encodeURIComponent(table)}?lang=${locale}`}
      /* The basket belongs to the table, not to the phone that scanned. */
      basket={`${restaurant}:${table}`}
      statusHref={`/qr/${encodeURIComponent(restaurant)}/${encodeURIComponent(table)}/status?lang=${locale}`}
    />
  );
}
