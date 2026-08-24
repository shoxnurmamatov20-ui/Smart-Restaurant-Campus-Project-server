'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { flash } from '@restaurant/ui';

import { useCart } from '../../cart-store';
import { sendFeedback, trackOrder } from '../../customer-client';
import {
  copy,
  ORDER_STATE,
  ORDER_STATE_NOTE,
  PROBLEM,
  SHARED,
  TRACK,
} from '@restaurant/surfaces/customer/copy';
import { ProblemSheet } from '../../problem-sheet';
import { CustomerDock } from '../../customer-dock';
import {
  BRANCH_BY_ID,
  BRANCHES,
  DISH_BY_ID,
  ORDER_LADDER,
  PORTION_BY_ID,
  say,
  TRACKED_ORDER,
  type Lang,
  type OrderState,
  type TrackedOrder,
} from '@restaurant/surfaces/customer/data';
import { trackedOrderFrom } from '@restaurant/surfaces/customer/order';
import { Money } from '../../money';

/**
 * How often the screen asks again.
 *
 * Ten seconds, and polling rather than a socket. Reverb carries the kitchen and
 * the floor on `branch.{id}.*`, which are private channels and rightly not open
 * to strangers — a guest's phone has no session to authorise one with. Ten is
 * the interval at which a rung appearing still feels like it happened, and it
 * costs one indexed lookup by bill number.
 */
const POLL_MS = 10_000;

/**
 * Order status.
 *
 * The ladder is the screen. Four states, drawn as a vertical rail with the
 * reached ones stamped with the time they were reached and the rest dimmed —
 * so a guest can see both where the order is and how long each step took,
 * which is what turns "cooking" from a spinner into information.
 *
 * The states come from `orders.state` and are never stored as words. The POS
 * reads `cooking` as "Tayyorlanmoqda" and this screen reads it as "Oshxonada":
 * one row, two audiences, `DATABASE.md §6.1`. Storing the sentence is how the
 * two ladders drift apart within a week of each other.
 *
 * ---------------------------------------------------------------------------
 * Two credentials, and neither is a session
 *
 * `GET /api/v1/public/orders/{number}` takes the bill number AND the last four
 * digits of the phone that placed it. That pair is deliberate: bill numbers are
 * sequential per restaurant, so an endpoint answering on the number alone would
 * hand a stranger somebody's address and dinner one keystroke at a time.
 *
 * Both come from the cart store, which remembered them when the order was
 * placed, and the number can also arrive in `?n=` — which is how a guest comes
 * back from a payment provider's redirect onto a fresh page.
 *
 * A guest with neither sees the design's sample order, labelled as one. That is
 * the state for somebody who opened the tab out of curiosity, and drawing
 * nothing there would be a blank screen where the design has a delivery.
 */
export function TrackBoard({ lang }: { lang: Lang }) {
  const t = copy(TRACK, lang);
  const s = copy(SHARED, lang);
  const p = copy(PROBLEM, lang);
  const cart = useCart();
  const params = useSearchParams();

  const [reporting, setReporting] = useState(false);
  const [rating, setRating] = useState(false);
  const [live, setLive] = useState<TrackedOrder | null>(null);
  /**
   * Why there is no progress bar, when there is none.
   *
   * Two opposite reasons, and `trackedOrderFrom()` cannot tell them apart — it
   * answers null for a bill that has left the ladder AND for one that has not
   * joined it yet, because neither has a rung to draw. To the person waiting
   * they are the opposite instruction: "confirm it in the bank's app" and "this
   * is not happening". So the raw payload is asked which.
   */
  const [stalled, setStalled] = useState<'awaiting' | 'closed' | null>(null);

  /*
   * `?n=` first, the store second.
   *
   * The query string is what survives a provider's redirect: a guest sent to
   * Payme comes back to a fresh page load with no React state at all, and the
   * number in the URL is the only thing that made the round trip. The phone
   * cannot ride there — a phone number in a URL is a phone number in a proxy
   * log — so it comes from the store, which is why a redirect that also lost
   * the tab falls back to the sample rather than to somebody else's order.
   */
  const number = params.get('n') ?? cart.placed;
  const phone = cart.placedPhone;

  useEffect(() => {
    if (number === null || phone === null) return;

    let running = true;

    const ask = async () => {
      const answer = await trackOrder(number, phone.replace(/\D/g, '').slice(-4));

      if (!running) return;

      if (!answer.ok) {
        // A network blip leaves the last good state on the screen. Only a
        // refusal — the order is not this guest's, or has been voided — clears
        // it, because that is the one case where what is drawn is wrong.
        if (answer.error !== 'offline') setStalled('closed');

        return;
      }

      const mapped = trackedOrderFrom(answer.data);

      if (mapped === null) {
        /*
         * No rung to draw, for one of two opposite reasons.
         *
         * `pending` means the money has not landed: the bill is at `draft`,
         * no docket has printed and no pan is lit, and the guest's move is to
         * finish the payment. Anything else here is a bill that has LEFT the
         * ladder — voided, refunded, comped — and there is nothing for them to
         * do at all. Telling somebody to confirm a payment for an order that
         * was cancelled is worse than saying nothing.
         */
        setStalled(answer.data.payment?.state === 'pending' ? 'awaiting' : 'closed');

        return;
      }

      setLive(mapped);
      setStalled(null);
    };

    void ask();

    const timer = setInterval(() => void ask(), POLL_MS);

    return () => {
      running = false;
      clearInterval(timer);
    };
  }, [number, phone]);

  if (number === null && cart.placed === null) {
    return (
      <>
        <main className="flex flex-1 flex-col items-center justify-center gap-3 px-[var(--phone-gutter)] text-center">
          <p className="font-display text-xl font-semibold">{t.noneHeading}</p>
          <p className="text-fg-subtle max-w-[34ch] text-sm leading-normal">{t.noneBody}</p>
          <Link
            href="/customer/menu"
            className="border-border mt-1 grid h-[var(--tap-min)] place-items-center rounded-md border px-5 text-sm font-semibold"
          >
            {s.open}
          </Link>
        </main>

        <CustomerDock lang={lang} cartCount={cart.count} />
      </>
    );
  }

  /*
   * The live order when there is one, the sample otherwise — and the screen
   * says which. `demo` is not a styling flag: it is the difference between "your
   * dinner is 20 minutes away" and "this is what that will look like", and a
   * guest who cannot tell them apart will wait for food nobody is cooking.
   */
  const order = live ?? TRACKED_ORDER;

  /**
   * "5 · hammasi yaxshi" — the design's one-tap review.
   *
   * `POST /api/v1/public/feedback` through the same handler the problem sheet
   * uses. It was `flash(p.rated)` and nothing else, so every guest who told a
   * real restaurant their dinner was good was thanked and discarded — and the
   * toast even promises the score lands on their customer record.
   *
   * The button's own label is the score: five. Anything less has a reason
   * behind it, and the problem sheet beside this is where a reason is typed.
   */
  async function rate() {
    setRating(true);

    const answer = await sendFeedback(lang, {
      score: 5,
      aspect: 'delivery',
      order_number: order.number,
    });

    setRating(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? s.notSent);

      return;
    }

    flash(p.rated);
  }
  const demo = live === null;
  const notice =
    stalled === 'awaiting'
      ? t.awaitingPayment
      : stalled === 'closed'
        ? t.orderGone
        : demo
          ? t.sampleOrder
          : null;
  const branch =
    cart.venues.find((venue) => venue.id === order.branchId) ??
    BRANCH_BY_ID.get(order.branchId) ??
    cart.venues[0] ??
    BRANCHES[0]!;
  const reached = ORDER_LADDER.indexOf(order.state);
  const delivering = order.courier !== null;

  return (
    <>
      <main className="flex-1 pb-6">
        <header
          className="px-[var(--phone-gutter)] pt-4"
          style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
        >
          <h1 className="font-display text-2xl leading-tight font-semibold tracking-tight">
            {t.heading}
          </h1>
          <p data-num className="text-fg-subtle mt-0.5 text-xs">
            №{order.number} · {branch.name}
          </p>

          {/*
           * Which of the two this is, said out loud.
           *
           * A sample delivery that reads like a real one is the worst thing
           * this screen can do: somebody waits for food nobody is cooking. And
           * an order that has left the ladder — voided, refunded, comped — is
           * not "still loading", it is over, and a progress bar frozen at
           * "Oshxonada" would say the opposite.
           */}
          {notice === null ? null : (
            <p className="border-border bg-bg-muted text-fg-muted mt-2 rounded-md border px-3 py-2 text-xs leading-normal">
              {notice}
            </p>
          )}
        </header>

        {/* ---------------------------------------------------------- eta */}
        {/*
         * A plain surface card, centred, with the stage named under the time —
         * `Mijoz ilovasi.dc.html:503-507`.
         *
         * It had been an accent-tinted block at 3xl. Two problems with that.
         * The accent on this surface means "an offer" — the promo card and the
         * loyalty strip both use it — so the one card telling a customer where
         * their dinner is looked like an advertisement. And the **stage line**
         * was missing entirely: "18:40" answers when, and never answers what,
         * which on a delivery is the question ("is it cooking, or is somebody
         * driving it here?"). It reads the same ladder as the steps below, so
         * the headline and the timeline cannot disagree.
         */}
        <div className="border-border bg-surface mx-[var(--phone-gutter)] mt-4 rounded-lg border px-5 py-5 text-center">
          <p className="text-fg-subtle text-xs">{delivering ? t.arriving : t.readyAt}</p>

          <p data-num className="font-display mt-1 text-4xl font-bold tracking-tight">
            {order.eta}
          </p>

          <p className="text-fg-muted mt-1 text-sm">
            {copy(ORDER_STATE, lang)[ORDER_LADDER[reached] ?? 'accepted']}
            {order.courier === null || !delivering ? '' : ` · ${order.courier.name}`}
          </p>
        </div>

        {/* -------------------------------------------------------- ladder */}
        <ol className="mt-5 px-[var(--phone-gutter)]">
          {ORDER_LADDER.map((state, index) => (
            <Step
              key={state}
              lang={lang}
              state={state}
              at={order.times[state] ?? null}
              done={index <= reached}
              current={index === reached}
              last={index === ORDER_LADDER.length - 1}
            />
          ))}
        </ol>

        {/* ------------------------------------------------------- courier */}
        {order.courier !== null ? (
          <section className="mt-5 px-[var(--phone-gutter)]">
            <div className="border-border bg-surface flex items-center gap-3 rounded-md border px-3.5 py-3">
              <span className="bg-bg-muted text-fg-muted grid h-11 w-11 flex-none place-items-center rounded-full text-sm font-bold">
                {order.courier.initials}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{order.courier.name}</span>
                <span className="text-fg-subtle block truncate text-xs">
                  {order.courier.vehicle}
                </span>
              </span>

              {/*
               * No call button, and its absence is the fix.
               *
               * It was `tel:+998781000000` — a literal, belonging to nobody on
               * this platform, on a control a guest presses when their dinner
               * is late. The design's promise is a *masked* leg: the guest and
               * the courier both see a platform number and neither sees the
               * other's. That is a telephony contract — `PBX_MASKED_NUMBER_KEY`
               * in `docs/GO-LIVE.md` — and no amount of code here produces one.
               * Nothing on the public order read carries the branch's own
               * number either.
               *
               * So the card names the courier and says the number is withheld,
               * which is true, instead of dialling a stranger.
               */}
            </div>

            <p className="text-fg-subtle mt-1.5 text-xs">{t.numberHidden}</p>
          </section>
        ) : null}

        {/* ------------------------------------------------------ contents */}
        <section className="mt-5 px-[var(--phone-gutter)]">
          <h2 className="text-fg-subtle text-xs font-semibold tracking-wide uppercase">
            {t.contents}
          </h2>

          <ul className="mt-2 flex flex-col">
            {order.lines.map((line) => {
              /*
               * The snapshot first, the catalogue behind it.
               *
               * `line.title` is what the dish was called when it was rung up,
               * frozen onto `order_items` at sale time. It is the only thing
               * that can name a dish the restaurant has since withdrawn — and
               * withdrawing a dish after somebody ordered it is ordinary. The
               * catalogue is consulted only for the fixture order, whose lines
               * carry no title because they name dishes it does contain.
               */
              const dish = cart.menu.dishes.find((item) => item.id === line.dishId);
              const named = line.title ?? (dish === undefined ? DISH_BY_ID.get(line.dishId) : dish);
              const title = typeof named === 'string' ? named : named && say(named.name, lang);

              if (title === undefined || title === '') return null;

              const portion = PORTION_BY_ID.get(line.portionId);

              return (
                <li
                  key={`${line.dishId}|${line.portionId}`}
                  className="border-divider flex items-baseline gap-3 border-b py-2.5 last:border-0"
                >
                  <span data-num className="text-fg-subtle w-6 flex-none text-xs font-semibold">
                    {line.quantity}×
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    {title}
                    {/*
                     * The size only where there is one. A live line carries no
                     * portion — a size is a modifier on this platform, priced
                     * into the line — so printing "· O'rta" beside it would be
                     * this screen inventing a detail of somebody's order.
                     */}
                    {demo && portion !== undefined ? (
                      <span className="text-fg-subtle"> · {say(portion.name, lang)}</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="border-divider mt-2 flex items-baseline justify-between border-t pt-3">
            <span className="text-md font-semibold">{s.total}</span>
            <Money tiyin={order.total} lang={lang} className="text-md" />
          </div>
        </section>

        {/* -------------------------------------------------------- repeat */}
        <div className="mt-5 flex flex-col gap-2 px-[var(--phone-gutter)]">
          <button
            type="button"
            onClick={() => {
              for (const line of order.lines) {
                cart.add({
                  dishId: line.dishId,
                  portionId: line.portionId,
                  modifierIds: [],
                  quantity: line.quantity,
                  note: '',
                });
              }

              /*
               * The confirmation stays here rather than jumping to the basket.
               * Sending the guest away would take them off the order they came
               * to check, which is not what "repeat" asked for. The cart tab's
               * badge counting up says the same thing without moving anybody.
               */
              flash(t.repeated);
            }}
            className="border-border h-[var(--tap-lg)] w-full rounded-md border text-sm font-semibold"
          >
            {t.repeat}
          </button>

          {/*
           * The two answers the design's bot asks for after a delivery
           * (`Telegram.dc.html:594`), on the surface that had neither.
           *
           * The rating only appears once the order is `handed`: asking somebody
           * to score a dinner a courier is still carrying is asking about
           * something that has not happened. The problem route is always on,
           * because the thing that went wrong may be the reason the ladder has
           * stopped moving.
           */}
          <div className="flex gap-2">
            {order.state === 'handed' ? (
              <button
                type="button"
                disabled={rating}
                onClick={() => void rate()}
                className="border-border h-[var(--tap-min)] flex-1 rounded-md border text-sm font-semibold disabled:opacity-50"
              >
                {p.rate}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setReporting(true)}
              className="border-border h-[var(--tap-min)] flex-1 rounded-md border text-sm font-semibold"
            >
              {p.report}
            </button>
          </div>

          {/*
           * `GAPS.md §4.2 Y4` — a guest can cancel inside two minutes and can
           * never edit. Saying where an edit goes instead is better than a
           * disabled button that explains nothing.
           */}
          <p className="text-fg-subtle text-xs leading-normal">{t.changeNote}</p>
        </div>
      </main>

      <ProblemSheet
        lang={lang}
        about={`№${order.number} · ${branch.name}`}
        open={reporting}
        onClose={() => setReporting(false)}
      />

      <CustomerDock lang={lang} cartCount={cart.count} />
    </>
  );
}

/**
 * One rung, with the rail drawn beside it.
 *
 * The connector is a border on the list item rather than a separate element, so
 * it cannot fall out of alignment with the dot at a font size the guest chose.
 */
function Step({
  lang,
  state,
  at,
  done,
  current,
  last,
}: {
  lang: Lang;
  state: OrderState;
  at: string | null;
  done: boolean;
  current: boolean;
  last: boolean;
}) {
  // No cast: `copy()` keeps the section's keys, and `OrderState` is exactly
  // that key union — so a state the catalogue forgot to word is a build error.
  const label = copy(ORDER_STATE, lang)[state];
  const note = copy(ORDER_STATE_NOTE, lang)[state];

  return (
    <li className="flex gap-3">
      <span className="flex flex-none flex-col items-center">
        <span
          aria-hidden
          className={`mt-1.5 grid h-3.5 w-3.5 place-items-center rounded-full ${
            done ? 'bg-acc' : 'bg-border'
          }`}
        >
          {current ? <span className="bg-surface h-1.5 w-1.5 rounded-full" /> : null}
        </span>

        {!last ? (
          <span
            aria-hidden
            className={`w-px flex-1 ${done ? 'bg-acc' : 'bg-border'}`}
            style={{ minHeight: '2rem' }}
          />
        ) : null}
      </span>

      <span className={`flex-1 pb-4 ${done ? '' : 'opacity-45'}`}>
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold">{label}</span>
          {at !== null ? (
            <span data-num className="text-fg-subtle text-xs">
              {at}
            </span>
          ) : null}
        </span>
        <span className="text-fg-subtle mt-0.5 block text-xs leading-normal">{note}</span>
      </span>
    </li>
  );
}
