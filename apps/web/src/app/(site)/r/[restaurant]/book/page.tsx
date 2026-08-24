import { pathLocale } from '@/lib/server-locale';
import { notFound } from 'next/navigation';

import { fetchGuestMenu } from '../../../../(guest)/guest-menu-server';
import { copyFor, guestLocale } from '../../../locale-bridge';
import { VENUE } from '../../../venue-data';
import { fetchVenue } from '../../../venue-server';
import { SiteFooter } from '../../../site-footer';
import { SiteHeader } from '../../../site-header';
import { bookDays } from './book-days';
import { BookForm } from './book-form';
import { fetchBookVenues } from './book-server';

/**
 * Booking a table, and the first thing on this platform a stranger can write.
 *
 * It works. `POST /api/v1/public/reservations` was written for this page: the
 * request lands `pending` in the restaurant's diary, holds no table, and a
 * manager confirms it against the evening. That distinction is on the screen as
 * well as in the API — the button says the request was sent, never that a table
 * is held, because a guest arriving on Friday expecting a table nobody agreed
 * to is the failure this whole shape exists to avoid.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ restaurant: string }> }) {
  const { restaurant } = await params;
  const locale = guestLocale(await pathLocale(), null);
  const t = copyFor(locale).site;
  const menu = await fetchGuestMenu(restaurant, locale);

  return {
    title: `${t.book.title} — ${menu?.restaurant?.name ?? VENUE.name}`,
    description: t.book.body,
  };
}

export default async function VenueBookPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurant: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { restaurant } = await params;
  const { lang } = await searchParams;

  if (restaurant === '') notFound();

  const locale = guestLocale(lang ?? (await pathLocale()), null);
  const t = copyFor(locale).site;
  /*
   * The venues, with the row id the diary files a booking under.
   *
   * Read here rather than in the form because the join is two server calls —
   * see `book-server.ts` — and a client component that made them would need a
   * public endpoint for each and a spinner on the one control the guest touches
   * first.
   */
  const [menu, venues, venue] = await Promise.all([
    fetchGuestMenu(restaurant, locale),
    fetchBookVenues(restaurant),
    /* This restaurant's own contacts, for the header and the footer — both
       used to print the demo's number on every venue's site. */
    fetchVenue(restaurant, '/book'),
  ]);
  const name = menu?.restaurant?.name ?? venue.name;

  return (
    <>
      <SiteHeader restaurant={restaurant} locale={locale} name={name} phone={venue.phone} />

      <main className="site-wrap py-10">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{t.book.title}</h1>
        <p className="text-fg-muted text-md mt-2 max-w-[62ch] leading-relaxed">{t.book.body}</p>

        <BookForm
          restaurant={restaurant}
          locale={locale}
          venues={venues}
          housePhone={venue.phone}
          days={bookDays(locale)}
        />
      </main>

      <SiteFooter
        locale={locale}
        name={name}
        branches={venue.branches}
        phone={venue.phone}
        telegram={venue.telegram}
      />
    </>
  );
}
