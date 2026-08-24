'use client';

import { useEffect, useState } from 'react';
import { flash } from '@restaurant/ui';

import { useCart } from '@/lib/guest-cart';
import { VAT_PERCENT } from '@restaurant/surfaces/money';

import { fill, som } from '../../../locale-bridge';
import type { GuestLocaleOf } from '../../../locale-bridge';
import {
  advanceOrder,
  clockOf,
  COURIER,
  stepClock,
  STEP_ETA,
  TRACK_LADDER,
  useDemoOrder,
  usePlacedOrder,
} from '../../../placed-order';
import { rungClocks, rungOf, trackSiteOrder, type SiteTrackedOrder } from '../../../site-client';
import type { SiteLocale } from '../../../venue-data';

/**
 * Where the order is — `dc.html:460-528`.
 *
 * This screen used to be one line of dead code: a `hasOrder` constant declared
 * as a false literal above the return and never assigned anywhere else, so the
 * early exit always fired and the five-rung ladder, the progress rail, the map,
 * the courier card, the line list and the total panel below it could not render
 * for any reader, ever. Eight `site.track.*` keys had been translated three
 * ways for markup nothing could reach.
 *
 * **Two halves, and only one of them is authoritative.** `placed-order.ts` holds
 * the receipt this browser was given — the bill number, the lines, the total the
 * server charged — so the screen draws something the instant it opens, and keeps
 * drawing it on a train. Where the food actually is comes from
 * `GET /api/v1/public/orders/{number}`, asked every fifteen seconds: the rung,
 * the minute each rung was reached, the minutes still to come, and the rider.
 * When the two disagree the server wins, always.
 *
 * The credential is the bill number plus the last four digits of the telephone
 * that placed it, which is why a demo order never polls: it has no digits.
 *
 * ---------------------------------------------------------------------------
 * Polling, and why not Reverb
 *
 * The realtime channel for this is `branch.{id}.orders` — a private staff
 * channel carrying every table's bill in the building. A guest has no session
 * to authorise onto it, and giving them one would be broadcasting a restaurant's
 * whole evening to whoever opened a tracking link. Fifteen seconds against an
 * endpoint that already answers one bill is the right shape for a stranger.
 *
 * `?demo=1` draws the design's own fixture instead, and only when this browser
 * has placed nothing. A screen that cannot be opened cannot be reviewed, and
 * showing a stranger a courier and a total they never ordered is exactly the
 * failure the old empty state was protecting against. The "next state" button is
 * that fixture's control and disappears the moment a real answer arrives — a
 * control that pretended to move a real kitchen would be worse than none.
 */
export function TrackScreen({
  restaurant,
  locale,
  demo,
  copy,
}: {
  restaurant: string;
  locale: GuestLocaleOf;
  /** `?demo=1` — draw the design's fixture when nothing has been placed here. */
  demo: boolean;
  copy: {
    title: string;
    sub: string;
    pending: string;
    about: string;
    delivered: string;
    order: string;
    total: string;
    paid: string;
    call: string;
    courierMeta: string;
    advance: string;
    rails: Record<string, string>;
    steps: readonly string[];
    none: string;
    noneSub: string;
    toMenu: string;
    stillInCart: string;
  };
}) {
  const cart = useCart(restaurant);
  const placed = usePlacedOrder(restaurant);

  /* The design's fixture, and only when this browser has placed nothing. It is
     a store rather than an effect because it stamps the clock — see the hook. */
  const sample = useDemoOrder(locale as SiteLocale, demo && placed === null);

  /* Where the food actually is. Above the early return, because a hook cannot
     be called conditionally — and it answers null for the fixture anyway, which
     carries no telephone digits to ask with. */
  const live = useLiveOrder(placed?.number ?? null, placed?.phoneLastFour ?? '');

  const order = placed ?? sample;

  if (order === null) {
    return (
      <main className="site-wrap py-20 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{copy.none}</h1>
        <p className="text-fg-muted mt-2 text-sm leading-normal">{copy.noneSub}</p>

        <a
          href={`/r/${encodeURIComponent(restaurant)}/menu`}
          className="bg-acc mt-6 inline-flex h-12 items-center rounded-md px-6 text-sm font-semibold text-white"
        >
          {copy.toMenu}
        </a>

        {cart.lines.length > 0 ? (
          <p className="text-fg-subtle mt-4 text-xs">{copy.stillInCart}</p>
        ) : null}
      </main>
    );
  }

  const money = (tiyin: number) => som(tiyin, locale);

  /*
   * The rung, from the kitchen where the kitchen has spoken.
   *
   * `rungOf` folds the API's seven fulfilment states onto the design's five —
   * `ready` is still the kitchen from a guest's chair, `served` and `handed`
   * both mean they have the food. Null for a status the ladder does not contain
   * (a draft waiting on an online payment, a voided bill), and then the local
   * rung stands rather than the screen drawing "step 0 of 5" for an order that
   * will never be cooked.
   */
  const reached = Math.min(
    (live === null ? null : rungOf(live.status)) ?? order.step,
    TRACK_LADDER.length - 1,
  );

  /*
   * When each rung was actually reached, against when it was estimated.
   *
   * `reached_at` is the first moment each state was entered — so a bill a
   * manager dragged back and forth still says when the food was ready. Rungs the
   * order has not got to have no entry and keep the design's own offsets, which
   * is what makes them a forecast rather than a claim.
   */
  const clocks =
    live === null ? {} : rungClocks(live.reached_at, (iso) => clockOf(iso, locale as SiteLocale));

  const eta = live?.eta_minutes ?? STEP_ETA[reached] ?? 0;

  /* The rider, once a dispatcher has assigned one. Null on a live order that
     nobody has picked up yet — and the card is simply absent, rather than
     drawing a stranger's name against an order still in the oven. */
  const rider = live?.courier ?? null;
  const courierName = live === null ? COURIER.name : (rider?.name ?? '—');

  return (
    <main className="site-wrap py-8 pb-20">
      <div className="flex flex-wrap items-baseline gap-3.5">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">{copy.title}</h1>
        <span className="text-fg-subtle font-mono text-[15px]">#{order.number}</span>
      </div>

      <p data-num className="text-fg-muted mt-2 text-[15px]">
        {fill(copy.sub, { address: order.destination, courier: courierName })}
      </p>

      <div className="mt-6 grid items-start gap-7 lg:[grid-template-columns:minmax(0,1fr)_400px]">
        <div className="grid gap-4">
          {/* ------------------------------------------------------- ladder */}
          <section className="border-border bg-surface rounded-lg border px-7 py-6.5">
            <div className="flex flex-wrap items-baseline justify-between gap-3.5">
              <h2 className="font-display text-2xl font-bold tracking-tight">
                {copy.steps[reached]}
              </h2>
              <p data-num className="text-acc text-sm font-semibold">
                {reached >= TRACK_LADDER.length - 1
                  ? copy.delivered
                  : fill(copy.about, { minutes: eta })}
              </p>
            </div>

            {/*
             * Five bars, one per rung — `dc.html:475-479`.
             *
             * Not one bar at 60%: a delivery has five named states and a guest
             * asking "where is it" is asking which of them, not what fraction
             * of the way. `data-rail` is the design's own grow-from-the-left
             * transition, so the fill moves when the rung does.
             */}
            <div className="mt-5 flex gap-1.5" data-rail aria-hidden>
              {TRACK_LADDER.map((step, index) => (
                <div key={step} className="h-1 flex-1 rounded-sm">
                  <div
                    className={`h-full rounded-sm ${index <= reached ? 'bg-acc' : 'bg-border'}`}
                  />
                </div>
              ))}
            </div>

            <ol className="mt-5">
              {TRACK_LADDER.map((step, index) => {
                const done = index < reached;
                const here = index === reached;

                return (
                  <li
                    key={step}
                    className="border-divider flex gap-3.5 border-b py-3 last:border-0"
                  >
                    <span
                      aria-hidden
                      className={`mt-px grid size-[22px] flex-none place-items-center rounded-full border-[1.5px] text-[11px] font-bold text-white ${
                        index <= reached ? 'border-acc' : 'border-border-strong'
                      } ${done ? 'bg-acc' : ''}`}
                    >
                      {/* A check for done, a filled dot for the rung it is on,
                          nothing for what has not happened — `dc.html:1010`. */}
                      {done ? '✓' : here ? <span className="bg-acc size-2 rounded-full" /> : null}
                    </span>

                    <div className="min-w-0">
                      <p
                        className={`text-[15px] font-semibold ${
                          index <= reached ? 'text-fg' : 'text-fg-subtle'
                        }`}
                      >
                        {copy.steps[index]}
                      </p>
                      <p data-num className="text-fg-subtle mt-0.5 text-[13px]">
                        {/* The kitchen's own minute where it recorded one, and
                            the design's estimate for the rungs it has not
                            reached. `copy.pending` for what is still ahead on a
                            local order, which has no forecast worth printing. */}
                        {clocks[index] ??
                          (index <= reached
                            ? stepClock(order, index, locale as SiteLocale)
                            : copy.pending)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>

            {/*
             * The design's `advance`, and only where nothing else moves the rung.
             *
             * A real order climbs because a kitchen pressed something; a control
             * beside it that also climbed would be two hands on one ladder, and
             * the guest's would be lying. So it is drawn for the demo order and
             * for one placed while the API was unreachable, and it disappears the
             * moment the server answers.
             */}
            {live !== null || reached >= TRACK_LADDER.length - 1 ? null : (
              <button
                type="button"
                onClick={() => {
                  advanceOrder(restaurant, order);
                  flash(copy.steps[reached + 1] ?? copy.delivered);
                }}
                className="border-border-strong bg-surface mt-4.5 h-10.5 rounded-md border px-4.5 text-[13px] font-semibold"
              >
                {copy.advance}
              </button>
            )}
          </section>

          {/* ------------------------------------------------------ courier */}
          {/*
           * Delivery only. A collection order has no courier and no route, and
           * a map under one would be a picture of nothing.
           *
           * And on a live order, only once a rider has one. `courier` is null
           * until a dispatcher assigns somebody, and a card drawn before then
           * would put a name and a route against a dinner still in the oven.
           */}
          {order.mode === 'delivery' && (live === null || rider !== null) ? (
            <section className="border-border bg-surface overflow-hidden rounded-lg border">
              {/*
               * The route band — `dc.html:492-494`, 220px.
               *
               * Drawn rather than fetched: there is no map key, no courier
               * telemetry and no tile budget on a page a stranger opens. What
               * it carries is the one thing the guest is owed here — that
               * somebody is between two points — and the distance beside the
               * name says how far.
               */}
              <div className="bg-bg-muted relative h-[220px]">
                <svg
                  viewBox="0 0 400 220"
                  className="text-border-strong size-full"
                  fill="none"
                  stroke="currentColor"
                  aria-hidden
                >
                  <path
                    d="M40 180 C 120 180, 110 96, 190 96 S 300 40, 360 40"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray="10 10"
                  />
                  <circle cx="40" cy="180" r="7" className="fill-fg-subtle" strokeWidth="0" />
                  <circle cx="360" cy="40" r="7" className="fill-acc" strokeWidth="0" />
                </svg>
              </div>

              <div className="flex items-center gap-4 px-5.5 py-4.5">
                <span
                  aria-hidden
                  className="bg-bg-muted text-fg-muted font-display grid size-11 flex-none place-items-center rounded-full text-sm font-bold"
                >
                  {rider === null ? COURIER.monogram : initialsOf(courierName)}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="font-display text-[15px] font-bold tracking-tight">{courierName}</p>
                  <p data-num className="text-fg-subtle mt-0.5 text-[13px]">
                    {/*
                     * The design's line for the design's rider — a moped, a
                     * distance and a rating — and the masked number for a real
                     * one, because those three fields do not exist: there is no
                     * courier telemetry, and `PublicOrderController` publishes a
                     * first name and four digits on purpose.
                     */}
                    {rider === null
                      ? fill(copy.courierMeta, {
                          distance: COURIER.distanceKm,
                          rating: COURIER.rating,
                        })
                      : (rider.phone_masked ?? '')}
                  </p>
                </div>

                {/*
                 * A real `tel:` link, not a button: on the phone this screen is
                 * read on, one tap has to start the call.
                 *
                 * And only for the design's rider. A live courier's number
                 * arrives masked — `+998 •• ••• 45 67` — because a tracking link
                 * is guarded by a bill number and four digits, which is enough to
                 * stop a stranger reading somebody's address and nowhere near
                 * enough to publish an employee's mobile to whoever holds it. A
                 * `tel:` built from that mask opens a dialler with nothing in it,
                 * so the guest gets the digits to check a missed call against and
                 * the restaurant's own number in the header instead.
                 */}
                {rider === null ? (
                  <a
                    href={`tel:${COURIER.phone.replace(/[^+\d]/g, '')}`}
                    className="bg-acc flex h-10 flex-none items-center rounded-md px-4.5 text-[13px] font-semibold text-white"
                  >
                    {copy.call}
                  </a>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>

        {/* -------------------------------------------------------- summary */}
        <aside className="border-border bg-surface rounded-lg border p-6 lg:sticky lg:top-24">
          <h2 className="font-display text-lg font-bold tracking-tight">{copy.order}</h2>

          <ul className="mt-3.5">
            {order.lines.map((line) => (
              <li
                key={`${line.name}-${line.unitPrice}`}
                className="border-divider flex items-baseline gap-3 border-b py-2.5 last:border-0"
              >
                <span
                  data-num
                  className="font-display text-acc w-6 flex-none text-[15px] font-bold"
                >
                  {line.quantity}
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium">{line.name}</span>
                <span data-num className="flex-none text-sm font-semibold">
                  {money(line.unitPrice * line.quantity)}
                </span>
              </li>
            ))}
          </ul>

          <div className="border-border mt-4 flex items-baseline justify-between border-t pt-3.5">
            <span className="text-fg-muted text-sm">{copy.total}</span>
            <span data-num className="font-display text-[22px] font-bold">
              {money(order.total)}
            </span>
          </div>

          {/* VAT is inside that number and is only ever shown — the same rule
              the checkout, the bill and `BillTotals::of()` all follow. */}
          <p data-num className="text-fg-subtle mt-2.5 text-xs leading-relaxed">
            {fill(copy.paid, {
              rail: copy.rails[order.rail] ?? order.rail,
              percent: VAT_PERCENT,
              amount: money(order.vatIncluded),
            })}
          </p>
        </aside>
      </div>
    </main>
  );
}

/**
 * How often to ask where the food is.
 *
 * Fifteen seconds. A kitchen ladder moves in minutes, not in seconds, and this
 * endpoint is open to the internet and rate-limited per address — a guest with
 * the page open through a forty-minute delivery makes about a hundred and sixty
 * requests, which is a rounding error beside one table's Wi-Fi and well inside
 * what the route allows.
 */
const POLL_MS = 15_000;

/**
 * The order, as the restaurant sees it.
 *
 * Null until the first answer, null forever without both halves of the
 * credential — the bill number and the last four digits of the telephone that
 * placed it. A demo order carries no digits, which is precisely how it stays a
 * demo: the screen cannot ask about it and does not try.
 *
 * A failed poll leaves the last good answer standing rather than clearing it. A
 * dropped connection is not an order that vanished, and a screen that emptied
 * itself every time a lift went between floors would be unreadable.
 *
 * Self-scheduling rather than `setInterval`, for two reasons: a slow answer
 * cannot overlap the next request, and a bill that has closed stops the loop
 * dead — `is_open === false` is a bill that will not move again, and polling it
 * until the guest closes the tab is asking a question already answered.
 *
 * The answer is kept **beside the number it was asked about**, and read back
 * only when the two still agree. That is what replaces clearing the state when
 * the number changes: a guest who places a second order would otherwise see the
 * first one's rung for as long as the first poll takes, and clearing it inside
 * the effect is a synchronous `setState` that costs a cascading render.
 */
function useLiveOrder(number: string | null, phoneLastFour: string): SiteTrackedOrder | null {
  const [live, setLive] = useState<{ number: string; order: SiteTrackedOrder } | null>(null);

  useEffect(() => {
    if (number === null || number === '' || phoneLastFour === '') return;

    let cancelled = false;
    let timer = 0;

    const ask = async () => {
      const answer = await trackSiteOrder(number, phoneLastFour);

      if (cancelled) return;

      if (answer.ok) {
        setLive({ number, order: answer.data });

        if (answer.data.is_open === false) return;
      }

      timer = window.setTimeout(() => void ask(), POLL_MS);
    };

    void ask();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [number, phoneLastFour]);

  return live !== null && live.number === number ? live.order : null;
}

/**
 * Two letters for the 44px circle.
 *
 * A live rider arrives as a first name alone — the surname is dropped on the
 * server, because a public tracking URL is not a place to publish an employee's
 * full name — so this usually yields one letter, and that is the honest output
 * rather than a second initial invented from somewhere.
 */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part !== '')
    .slice(0, 2)
    .map((part) => (part[0] ?? '').toUpperCase())
    .join('');
}
