import { pathLocale } from '@/lib/server-locale';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CallWaiter } from './call-waiter';
import { copyFor, fill, guestLocale } from '../../../guest-session';
import { allDishes } from '@restaurant/surfaces/guest/menu-data';
import { TABLE_ORDER, WIFI_NETWORK } from '@restaurant/surfaces/guest/table-data';
import { fetchGuestMenu } from '../../../guest-menu-server';

/**
 * What a guest sees one second after pointing a camera at the table.
 *
 * The whole surface hangs off this URL, and the URL is the session: the
 * restaurant and the table are in the path because a QR sticker is printed once
 * and cannot carry state. There is no sign-in, no cookie to set and nothing to
 * install — the design says so on the card itself, because the first question a
 * guest has is whether they are about to be asked for an app.
 *
 * Three doors, in the order the design puts them: read the menu, call the
 * waiter, pay. Not a menu with the other two buried in a drawer — a guest who
 * scanned mid-meal wants the second or the third, and a guest who just sat down
 * wants the first. Guessing wrong costs them a tap either way; guessing at all
 * costs the ones who wanted something else.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ restaurant: string; table: string }>;
}) {
  const { restaurant } = await params;

  return {
    title: restaurant,
    // A table's QR page is per-guest and per-moment. Indexing it would put a
    // stranger's table into a search result.
    robots: { index: false, follow: false },
  };
}

export default async function QrEntryPage({
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
  const t = copyFor(locale).qr;

  const menu = await fetchGuestMenu(restaurant, locale);
  const dishes = menu === null ? 0 : allDishes(menu).length;

  const here = `/qr/${encodeURIComponent(restaurant)}/${encodeURIComponent(table)}`;

  return (
    <main data-safe-top className="flex flex-1 flex-col pb-8">
      {/*
       * The dark band — `Mehmon.dc.html:83-91`, 196px of `--n-800` to `--n-900`
       * with the language chips floating on it.
       *
       * The page opened on a plain white header, and the band is not styling:
       * it is the only thing on this surface that says a restaurant has been
       * scanned rather than a web page opened. It is also the reason the
       * language switch can be three small chips instead of a full-width row —
       * on a dark field at the top right they are found without being loud.
       */}
      <div className="relative flex h-[196px] flex-col justify-end px-5.5 pb-5.5 text-white">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, var(--n-800), var(--n-900))' }}
        />

        <nav
          aria-label="til"
          className="absolute top-4.5 right-4.5 flex gap-1.5"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          {/*
           * Links rather than a control, because there is no session to store a
           * preference in: the choice rides in the URL and survives a reload,
           * which a piece of client state would not.
           */}
          {(['uz', 'ru', 'en'] as const).map((code) => (
            <Link
              key={code}
              href={`${here}?lang=${code}`}
              aria-current={code === locale}
              className="rounded-full px-2.5 py-1 text-[11px]"
              style={{
                background: code === locale ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.10)',
                color: code === locale ? '#fff' : 'rgba(255,255,255,.7)',
                fontWeight: code === locale ? 700 : 500,
              }}
            >
              {code.toUpperCase()}
            </Link>
          ))}
        </nav>

        <h1 className="font-display relative text-[26px] font-extrabold tracking-tight uppercase">
          {menu?.restaurant?.name ?? restaurant}
        </h1>
        <p className="relative mt-0.5 text-sm" style={{ color: 'rgba(255,255,255,.72)' }}>
          {fill(t.scan.branch, { name: menu?.restaurant?.name ?? restaurant })}
        </p>
      </div>

      <div className="px-[var(--guest-gutter)] pt-5.5">
        {/*
         * The table card — `dc.html:94-102`. The table number was the page's
         * `<h1>`, which said it once and then scrolled away; the design keeps it
         * as a card with the waiter and the cover count beside it, because it is
         * the thing a guest checks against the little number on the table before
         * they trust anything else on the screen.
         */}
        <div className="border-border bg-brand-50 flex items-center gap-3 rounded-[14px] border px-4 py-3.5">
          <span className="bg-brand-500 font-display grid size-11 flex-none place-items-center rounded-xl text-[19px] font-extrabold text-white">
            {table}
          </span>
          <span>
            <span className="block text-[15px] font-semibold">{fill(t.scan.table, { table })}</span>
            <span className="text-fg-muted mt-px block text-[13px]">
              {fill(t.scan.tableMeta, { waiter: TABLE_ORDER.waiter, guests: TABLE_ORDER.guests })}
            </span>
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-2.5">
          <Door
            href={`${here}/menu`}
            title={t.scan.openMenu}
            sub={dishes > 0 ? fill(t.scan.openMenuSub, { count: dishes }) : t.common.offline}
            primary
          />

          {/*
           * The order and the bill, drawn against fixtures.
           *
           * Neither has an endpoint: nothing reports a table's open order and
           * nothing takes a guest's payment. Both screens are complete and both
           * say `Namoyish rejimi · to'lov yuborilmadi` on them — the line the
           * copy catalogue was written with, because the designer expected this
           * state. Leaving them as dead cards read as a menu app; opening them
           * onto a screen that lies about a bill would be worse. Saying so on
           * the screen is the third option and the only honest one.
           */}
          <Door
            href={`${here}/status`}
            title={t.status.title}
            sub={fill(t.status.readyBy, { time: TABLE_ORDER.readyBy })}
          />
          <Door href={`${here}/bill`} title={t.scan.payBill} sub={t.scan.payBillSub} />

          {/*
           * Calling a waiter is the one door that is not a screen — it is a
           * message to a handset on the floor, and it now has one:
           * `POST /public/tables/{token}/call` writes the row and broadcasts
           * `tables.guest.called` on `branch.{id}.floor`. The card was drawn
           * shut before the channel existed, which made the second
           * most-pressed control on this surface look broken.
           */}
          <CallWaiter
            endpoint={`${here}/service/call?lang=${locale}`}
            waiter={TABLE_ORDER.waiter}
            copy={{
              title: t.scan.callWaiter,
              sub: t.scan.callWaiterSub,
              called: t.common.waiterCalled,
              onWay: t.common.waiterOnWay,
              demo: t.common.demoPayment,
            }}
          />
        </div>

        <div className="border-divider mt-5.5 border-t pt-4.5">
          <p className="text-fg-subtle text-[13px] leading-relaxed">{t.scan.noApp}</p>

          {/*
           * The Wi-Fi line — `dc.html:133-136`. A green dot and a network name:
           * the second question every guest at a table actually has, and the one
           * a printed card on the table usually answers badly.
           */}
          <p className="text-fg-subtle mt-4 flex items-center gap-2 text-xs">
            <span aria-hidden className="bg-success-500 size-1.5 flex-none rounded-full" />
            {fill(t.scan.wifi, { network: WIFI_NETWORK })}
          </p>
        </div>
      </div>
    </main>
  );
}

/**
 * One of the three doors.
 *
 * 44px is the floor and these are far above it: the design gives them a whole
 * card each, because they are pressed by somebody holding a phone in one hand at
 * a table, often in low light, often having just sat down.
 */
function Door({
  href,
  title,
  sub,
  primary = false,
}: {
  href: string;
  title: string;
  sub: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-[72px] flex-col justify-center rounded-md px-4 py-3 text-left ${
        primary ? 'bg-acc text-white' : 'bg-surface border'
      }`}
    >
      <span className="text-md block leading-snug font-semibold">{title}</span>
      <span className={`mt-0.5 block text-sm ${primary ? 'opacity-80' : 'text-fg-subtle'}`}>
        {sub}
      </span>
    </Link>
  );
}
