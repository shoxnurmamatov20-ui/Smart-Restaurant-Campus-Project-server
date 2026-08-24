import { pathLocale } from '@/lib/server-locale';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { translate } from '@restaurant/surfaces/guest/menu-data';
import { GuestBasket } from './basket';
import { CallWaiter } from '../call-waiter';
import { copyFor, fill, guestLocale, som } from '../../../../guest-session';
import {
  lineTotal,
  orderCount,
  orderStep,
  orderSubtotal,
  TABLE_LADDER,
  TABLE_ORDER,
  type TableStep,
} from '@restaurant/surfaces/guest/table-data';
import { fetchTableOrder } from '../../../../guest-table-server';

/**
 * Where the table's food is.
 *
 * A server component with no client state, because nothing on it is interactive
 * — it is a status board, and the only thing that changes it is the kitchen.
 * `GET /api/v1/public/tables/{token}/order` is what fills it; a reload is what
 * refreshes it, and a Reverb frame on `branch.{id}.orders` is the improvement
 * that would remove the reload.
 *
 * Three answers, not two, and the screen draws each differently. A live table
 * with an open bill draws that bill. A live table with NOTHING open draws the
 * empty state — a guest who has just sat down must not be shown four courses
 * somebody else ate. An API that did not answer draws the fixture and says
 * `Namoyish rejimi`, which is the same fallback the menu uses one screen back.
 *
 * The lines carry their own rung, not just the table. A guest looking at this
 * screen is almost always asking one question — why has the tea not come when
 * the plov has — and a single table-level "cooking" answers it with a shrug.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ restaurant: string }> }) {
  const { restaurant } = await params;

  return { title: restaurant, robots: { index: false, follow: false } };
}

export default async function GuestStatusPage({
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
  const copy = copyFor(locale).qr;
  const t = copy.status;

  const live = await fetchTableOrder(restaurant, table, locale);

  /*
   * The fixture stands in for an API that did not answer, and ONLY for that.
   * `live.live === true` with a null order is a real, empty table, and it keeps
   * the null so the empty state below can draw.
   */
  const order = live.live ? live.order : TABLE_ORDER;
  const here = `/qr/${encodeURIComponent(restaurant)}/${encodeURIComponent(table)}`;
  const reached = order === null ? -1 : TABLE_LADDER.indexOf(orderStep(order));

  return (
    <main data-safe-top className="flex flex-1 flex-col px-[var(--guest-gutter)] pb-8">
      <header className="pt-2">
        <Link href={`${here}?lang=${locale}`} className="text-fg-muted text-sm font-semibold">
          ← {copy.dish.back}
        </Link>

        <h1 className="font-display mt-2 text-3xl leading-tight font-semibold tracking-tight">
          {t.title}
        </h1>

        <p data-num className="text-fg-subtle mt-1 text-sm">
          {order === null
            ? t.empty
            : `${fill(t.order, { number: order.number })} · ${fill(t.lines, { count: orderCount(order) })}`}
        </p>
      </header>

      {/*
       * Everything below the header describes a bill, so a table with none
       * draws none of it — see the file note. The basket and the three buttons
       * still draw: a guest who has just sat down is exactly the person who
       * needs "add from the menu".
       */}
      {order !== null ? (
        <>
          {/* ------------------------------------------------------------- eta */}
          {/*
           * The card the whole screen is built around — `Mehmon.dc.html:336-342`.
           *
           * Two things it was missing. The **state chip**: a dot and the word
           * "cooking" on the warning ramp, which is the answer to the question the
           * guest opened the screen with. Without it the card was a number with no
           * subject — twelve minutes until what? And the **ramp**: it was drawn on
           * the accent, the same tint the promo blocks use, where the design puts
           * food-in-progress on `--warning-50`. Amber here is not an alarm; it is
           * "in hand", and it is the one card on this surface that changes colour
           * when the kitchen finishes.
           */}
          <section className="border-warning-500/25 bg-warning-50 mt-5 rounded-2xl border px-4.5 py-4.5">
            <p className="flex items-center gap-2.5">
              <span aria-hidden className="bg-warning-500 size-2.5 flex-none rounded-full" />
              <span className="text-warning-600 text-[13px] font-semibold tracking-wide uppercase">
                {t.cooking}
              </span>
            </p>

            <p data-num className="font-display mt-2 text-3xl font-bold tracking-tight">
              {t.about} {order.etaMinutes} {t.minutes}
            </p>

            <p data-num className="text-fg-muted mt-1 text-[13px]">
              {fill(t.readyBy, { time: order.readyBy })}
            </p>
          </section>

          {/* ---------------------------------------------------------- ladder */}
          {/*
           * Every rung carries its clock — `Mehmon.dc.html:619-625`.
           *
           * The ladder was five words and a line. A guest can see from five words
           * that the kitchen accepted the order; only the clock says it did so
           * twenty minutes ago, which is the whole question they opened the screen
           * with. The rungs still to come say "pending" rather than a guessed time.
           */}
          <ol className="mt-5">
            {TABLE_LADDER.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="flex flex-none flex-col items-center">
                  <span
                    aria-hidden
                    className={`mt-1.5 h-3 w-3 rounded-full ${
                      index <= reached ? 'bg-acc' : 'bg-border'
                    }`}
                  />
                  {index < TABLE_LADDER.length - 1 ? (
                    <span
                      aria-hidden
                      className={`w-px flex-1 ${index <= reached ? 'bg-acc' : 'bg-border'}`}
                      style={{ minHeight: '1.5rem' }}
                    />
                  ) : null}
                </span>

                <span className="flex-1 pb-3">
                  <span
                    className={`block text-sm ${index <= reached ? 'font-semibold' : 'text-fg-subtle'}`}
                  >
                    {t.steps[step]}
                  </span>
                  <span data-num className="text-fg-subtle mt-0.5 block text-xs">
                    {order.reachedAt[step] ?? t.pending}
                  </span>
                </span>
              </li>
            ))}
          </ol>

          {/* ----------------------------------------------------------- lines */}
          <section className="mt-4">
            <h2 className="text-fg-subtle text-xs font-semibold tracking-wide uppercase">
              {t.yourOrder}
            </h2>

            <ul className="mt-2 flex flex-col">
              {order.lines.map((line) => (
                <li
                  key={line.id}
                  className="border-divider flex items-start gap-3 border-b py-3 last:border-0"
                >
                  <span data-num className="text-fg-subtle w-6 flex-none text-sm font-semibold">
                    {line.quantity}×
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug font-semibold">
                      {translate(line.name, locale)}
                    </span>
                    <StepNote step={line.step} label={t.steps[line.step]} pending={t.pending} />
                  </span>

                  <span data-num className="flex-none text-sm font-semibold">
                    {som(lineTotal(line), locale)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="border-divider mt-2 flex items-baseline justify-between border-t pt-3">
              <span className="text-md font-semibold">{copyFor(locale).qr.bill.items}</span>
              <span data-num className="text-md font-semibold">
                {som(orderSubtotal(order), locale)}
              </span>
            </div>
          </section>
        </>
      ) : null}

      {/*
       * The basket, kept apart from the lines above.
       *
       * Those are what the kitchen has; this is what the table has chosen and
       * not yet told anyone. One list holding both would answer neither
       * question a guest is actually asking.
       */}
      <GuestBasket
        basket={`${restaurant}:${table}`}
        locale={locale}
        menuHref={`${here}/menu?lang=${locale}`}
        sendHref={`${here}/service/order?lang=${locale}`}
        copy={{
          title: t.yourOrder,
          empty: t.empty,
          addMore: t.addMore,
          total: copy.bill.total,
          waiter: copy.scan.callWaiterSub,
          send: t.send,
          sending: t.sending,
          sent: t.sent,
        }}
      />

      <div className="mt-5 flex flex-col gap-2">
        {/* The design's status footer is two controls — call, and add to the
            order (`Mehmon.dc.html:378-381`). The first was missing, which is
            the one a guest reaches for when the ladder has not moved. */}
        <CallWaiter
          variant="button"
          endpoint={`${here}/service/call?lang=${locale}`}
          /*
           * The fixture's name when the API answered nothing, and the copy's
           * own word when it answered. The endpoint does not publish which
           * waiter has a table and should not — naming a member of staff to
           * anybody who scans a sticker is a decision nobody has made.
           */
          waiter={
            order?.waiter === undefined || order.waiter === '' ? TABLE_ORDER.waiter : order.waiter
          }
          copy={{
            title: copy.scan.callWaiter,
            sub: copy.scan.callWaiterSub,
            called: copy.common.waiterCalled,
            onWay: copy.common.waiterOnWay,
            demo: copy.common.demoPayment,
          }}
        />

        <Link
          href={`${here}/menu?lang=${locale}`}
          className="border-border grid h-[var(--tap-min)] place-items-center rounded-md border text-sm font-semibold"
        >
          {t.addMore}
        </Link>

        <Link
          href={`${here}/bill?lang=${locale}`}
          className="bg-acc grid h-[52px] place-items-center rounded-md text-base font-semibold text-white"
        >
          {copy.scan.payBill}
        </Link>
      </div>

      <p className="text-fg-subtle mt-5 text-xs leading-normal">{copy.common.demoPayment}</p>
    </main>
  );
}

/**
 * A line's own rung, worded as a state rather than a percentage.
 *
 * A line that has been served says nothing — it is on the table, the guest can
 * see it — and a line still waiting says which rung it is on. Repeating "served"
 * beside four plates that are already there is noise on a 360px screen.
 */
function StepNote({ step, label, pending }: { step: TableStep; label: string; pending: string }) {
  if (step === 'served') return null;

  return (
    <span className="text-fg-subtle mt-0.5 block text-xs">
      {label} · {pending}
    </span>
  );
}
