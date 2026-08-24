'use client';

import { flash } from '@restaurant/ui';
import { useState } from 'react';

import { COURIER_COPY, copy, fill, FLASH, SHARED } from '@restaurant/surfaces/crew/copy';
import {
  COURIER_CASH,
  COURIER_TODAY,
  DROPS,
  ROUTE_STOPS,
  ROUTE_SUMMARY,
  say,
  type Drop,
  type Lang,
} from '@restaurant/surfaces/crew/data';
import { realId, type RiderDrop } from '@restaurant/surfaces/crew/live';
import { Som } from '../crew-money';
import { drain, enqueue } from '../crew-queue';
import { EmptyState, Note, NotWired, SectionLabel } from './bits';

/** The three figures the design puts above a list — one row, no chrome. */
function MiniStats({ items }: { items: readonly { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2.5">
      {items.map((item) => (
        <div key={item.label} className="bg-bg-subtle rounded-[14px] px-3 py-2.5">
          <dt className="text-fg-subtle text-2xs truncate">{item.label}</dt>
          <dd data-num className="font-display mt-0.5 text-lg font-bold">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The courier's three screens.
 *
 * The role exists only in this app — there is no console for it and no till —
 * so leaving all three unbuilt left a whole job with no surface anywhere on the
 * platform. The reason given was a location fix, and it was the wrong reason
 * for the same shape of mistake as the storekeeper's scanner: a map makes the
 * route nicer, and a list of stops in the right order is what a courier
 * actually works from.
 *
 * The one thing on these screens that is not a convenience is the cash. What a
 * courier carries is the till's money from the moment a guest hands it over,
 * and the screen says so — because the alternative is a courier who thinks of
 * it as theirs until somebody asks.
 */
export function DeliveriesPanel({ lang }: { lang: Lang }) {
  const t = copy(COURIER_COPY, lang);
  const shared = copy(SHARED, lang);

  const f = copy(FLASH, lang);

  const [state, setState] = useState<Record<string, Drop['state']>>({});

  const stateOf = (id: string, initial: Drop['state']): Drop['state'] => state[id] ?? initial;

  /* Counted from what is on screen, so the card at the top cannot disagree with
     the list under it after a press. The design derives it the same way. */
  const open = DROPS.filter((drop) => stateOf(drop.id, drop.state) !== 'delivered').length;

  const LABEL: Record<string, string> = {
    new: t.stateNew,
    picked: t.statePicked,
    delivered: t.stateDelivered,
  };

  const TONE: Record<string, string> = {
    new: 'bg-bg-muted text-fg-muted',
    picked: 'bg-warning-50 text-warning-700',
    delivered: 'bg-success-50 text-success-700',
  };

  return (
    <>
      <MiniStats
        items={[
          { label: say(COURIER_TODAY.left, lang), value: String(open) },
          { label: say(COURIER_TODAY.done, lang), value: COURIER_TODAY.doneCount },
          { label: say(COURIER_TODAY.distance, lang), value: COURIER_TODAY.distanceValue },
        ]}
      />

      <NotWired>{shared.notWired}</NotWired>

      <SectionLabel>{t.drops}</SectionLabel>

      {DROPS.length === 0 ? (
        <EmptyState>{t.noDrops}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {DROPS.map((drop) => {
            const current = stateOf(drop.id, drop.state);

            return (
              <li
                key={drop.id}
                className="border-border bg-surface rounded-[14px] border px-4 py-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p data-num className="text-sm font-semibold">
                      {drop.number}
                    </p>
                    <p className="text-fg-subtle mt-0.5 text-xs leading-normal">
                      {say(drop.address, lang)}
                    </p>
                    {/*
                     * Where the bag came from and when — the design draws it
                     * under the address on every card (`Xodimlar ilovasi`, the
                     * `DROPS` fixture's `from`). The `Drop` type had no field
                     * for it, so no card carried it: a courier with four bags in
                     * the box could not tell which branch this one came out of.
                     */}
                    <p className="text-fg-subtle mt-[3px] text-xs leading-normal">
                      {say(drop.from, lang)}
                    </p>
                  </div>

                  <span
                    className={`rounded-pill text-2xs flex-none px-2.5 py-1 font-semibold ${TONE[current]}`}
                  >
                    {LABEL[current]}
                  </span>
                </div>

                <div className="border-divider mt-3 flex items-center justify-between gap-3 border-t pt-3">
                  <span data-num className="text-fg-subtle text-xs">
                    {drop.distance}
                  </span>

                  {/*
                   * Whether the money is coming is the courier's most important
                   * fact about a drop — they knock on the door either holding
                   * out a hand or not. It is a chip, not a line of small type.
                   */}
                  <span className="flex items-center gap-2.5">
                    <span
                      className={`rounded-pill text-2xs px-2.5 py-1 font-semibold ${
                        drop.collectCash
                          ? 'bg-brand-50 text-brand-700'
                          : 'bg-bg-muted text-fg-muted'
                      }`}
                    >
                      {drop.collectCash ? t.collect : t.paid}
                    </span>
                    <Som tiyin={drop.total} lang={lang} />
                  </span>
                </div>

                {/*
                 * What the guest asked for — "do not ring, knock instead", "also
                 * asked for a printed receipt". The design gives it its own line
                 * at the foot of the card, and it is the half of a delivery a
                 * courier cannot work out from an address.
                 */}
                <p className="text-fg-muted mt-2.5 text-xs leading-normal">
                  {say(drop.note, lang)}
                </p>

                {current !== 'delivered' ? (
                  <button
                    type="button"
                    data-press
                    onClick={() => {
                      const next = current === 'new' ? 'picked' : 'delivered';

                      setState((now) => ({ ...now, [drop.id]: next }));

                      /*
                       * The write exists and the read does not, which is why
                       * this list is still the design's own.
                       *
                       * `delivery_status` is one of the eight verbs
                       * `POST /staff/actions` takes — `order_id` plus one of
                       * picked · enroute · delivered · failed, stamped with the
                       * moment of the press rather than the moment of the
                       * drain, so a round worked in a stairwell is not reported
                       * as instant. What nothing publishes is *this rider's own
                       * round*: `GET /orders/deliveries` is the dispatcher's
                       * board — every courier plus the unassigned pile — and
                       * `orders/orders` has no courier filter. Until one of
                       * those answers, these rows carry the design's word ids
                       * and there is nothing real to name, so the entry is
                       * queued without a verb: visible, and honest about not
                       * being sendable.
                       */
                      const orderId = realId(drop.id);

                      enqueue(
                        next === 'picked' ? t.pick : t.deliver,
                        `${drop.number} · ${say(drop.address, lang)}`,
                        orderId === null
                          ? undefined
                          : {
                              kind: 'delivery_status',
                              payload: { order_id: orderId, status: next },
                            },
                      );

                      if (orderId !== null) void drain();

                      flash(next === 'picked' ? f.dropPicked : f.dropDelivered);
                    }}
                    className="bg-acc mt-3 h-12 w-full rounded-[11px] text-sm font-semibold text-white"
                  >
                    {current === 'new' ? t.pick : t.deliver}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export function RoutePanel({ lang }: { lang: Lang }) {
  const t = copy(COURIER_COPY, lang);

  return (
    <>
      {/*
       * What is left of the round, before the stops themselves.
       *
       * The design leads with these two because they are the answer to the only
       * question a courier has between drops — am I going to make it — and a
       * list of four addresses does not answer it without arithmetic.
       */}
      <dl className="grid grid-cols-2 gap-2.5">
        <div className="bg-bg-subtle rounded-[14px] px-4 py-3">
          <dt className="text-fg-subtle text-2xs">{t.routeLeft}</dt>
          <dd data-num className="font-display mt-0.5 text-xl font-bold">
            {ROUTE_SUMMARY.distance}
          </dd>
        </div>
        <div className="bg-bg-subtle rounded-[14px] px-4 py-3">
          <dt className="text-fg-subtle text-2xs">{t.routeTime}</dt>
          <dd data-num className="font-display mt-0.5 text-xl font-bold">
            {say(ROUTE_SUMMARY.minutes, lang)}
          </dd>
        </div>
      </dl>

      <SectionLabel>{t.route}</SectionLabel>

      <ol className="flex flex-col">
        {ROUTE_STOPS.map((stop, index) => (
          <li key={stop.id} className="flex gap-3">
            <span className="flex flex-none flex-col items-center">
              <span
                aria-hidden
                className={`mt-1.5 size-3 rounded-full ${stop.next ? 'bg-acc' : 'bg-border'}`}
              />
              {index < ROUTE_STOPS.length - 1 ? (
                <span aria-hidden className="bg-border w-px flex-1" style={{ minHeight: '2rem' }} />
              ) : null}
            </span>

            <span className="flex-1 pb-5">
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-semibold">{say(stop.name, lang)}</span>
                {stop.next ? (
                  <span className="bg-acc-soft text-acc rounded-pill text-2xs px-2 py-0.5 font-semibold">
                    {t.next}
                  </span>
                ) : null}
              </span>
              <span className="text-fg-subtle mt-0.5 block text-xs">{say(stop.kind, lang)}</span>
              <span data-num className="text-fg-subtle mt-0.5 block text-xs">
                {stop.eta} · {stop.distance}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <Note>{t.routeNote}</Note>
    </>
  );
}

export function CashPanel({
  lang,
  drops = [],
  declaredTiyin = null,
  live = false,
}: {
  lang: Lang;
  /**
   * This rider's own open round — `riderRound()`.
   *
   * What is in the pocket is the sum of what each door owed, so the hero card
   * and the list under it are one derivation rather than a stored figure. A
   * card that announced a total the rows beneath it did not add up to is the
   * first number on this screen a courier would stop believing.
   */
  drops?: readonly RiderDrop[];
  /** What this person already declared today — `crewChecklist()`. */
  declaredTiyin?: number | null;
  live?: boolean;
}) {
  const t = copy(COURIER_COPY, lang);
  const shared = copy(SHARED, lang);
  const f = copy(FLASH, lang);

  const [handed, setHanded] = useState(declaredTiyin !== null);

  /*
   * The rows, live or drawn.
   *
   * Only the drops that owe money: a card payment already reached the
   * restaurant and putting it on a hand-over list would have a cashier counting
   * notes that were never collected.
   */
  const rows = live
    ? drops
        .filter((drop) => drop.collectTiyin > 0)
        .map((drop) => ({
          number: drop.number,
          where: { uz: drop.where, ru: drop.where, en: drop.where },
          amount: drop.collectTiyin,
        }))
    : COURIER_CASH.rows;

  const onHand = live ? rows.reduce((sum, row) => sum + row.amount, 0) : COURIER_CASH.onHand;

  return (
    <>
      <NotWired>{live ? shared.queued : shared.notWired}</NotWired>

      {/*
       * The hero, in the design's own words: what is in the courier's pocket,
       * and the line under it saying how it got there. Not a card among cards —
       * it is the one figure this tab exists for, and the whole shift is
       * reconciled against it.
       */}
      <div className="rounded-[20px] bg-[var(--crew-hero-bg)] px-5 py-4">
        <p className="text-xs text-[var(--crew-hero-dim)]">{t.onHand}</p>
        <p className="font-display mt-1.5 text-[30px] leading-none font-bold tracking-tight text-[var(--crew-hero-fg)]">
          <Som tiyin={onHand} lang={lang} unit={false} />
        </p>
        {/* The currency word opens this line rather than sitting beside the
            figure — at 30px a unit set alongside competes with the number, and
            the number is the only thing this card exists to say. It is part of
            the design's own sentence, so it is not composed here. */}
        {/* Counted from the rows above rather than written down: the note read
            "2 buyurtma" for every courier, under the figure they hand over. */}
        <p className="text-2xs mt-1.5 text-[var(--crew-hero-dim)]">
          {fill(t.onHandNote, { n: rows.length })}
        </p>
      </div>

      <SectionLabel>{t.collected}</SectionLabel>

      <ul className="flex flex-col">
        {rows.map((row) => (
          <li
            key={row.number}
            className="border-divider flex items-center justify-between gap-3 border-b py-3 last:border-0"
          >
            <span className="min-w-0">
              <span data-num className="block text-sm font-semibold">
                {row.number}
              </span>
              <span className="text-fg-subtle block text-xs">{say(row.where, lang)}</span>
            </span>
            <Som tiyin={row.amount} lang={lang} />
          </li>
        ))}
      </ul>

      <button
        type="button"
        data-press
        disabled={handed}
        onClick={() => {
          /*
           * Recorded here, moved at the till — and that is the design, not a
           * gap.
           *
           * `POST /pos/drawer/movements` is the only call that moves money into
           * a drawer, and it needs two things a courier does not have and must
           * not be given: `pos.drawer`, which belongs to the cashier, and an
           * **open till shift** to book the movement against. Handing a rider
           * the drawer permission so that a button could post would put the one
           * person who is never in the building in a position to declare cash
           * into a till nobody had counted — which is precisely the reconcili-
           * ation this screen exists to make possible.
           *
           * So the money moves when a cashier counts it in, against their own
           * shift, and this button is the courier's declaration that they are
           * carrying it. The note underneath says whose money it is until then.
           */
          setHanded(true);

          if (!live || onHand <= 0) {
            // A fixture round has nothing real to declare, and a rider with no
            // cash collected has nothing to hand over — a row saying "0" would
            // read as a hand-over that happened when none did.
            flash.problem(f.notRecorded);

            return;
          }

          /*
           * `cash_handover` — the tenth verb, and it was the missing half of
           * this screen.
           *
           * It writes to `staff.actions` and to nothing else, deliberately: the
           * money moves when a cashier counts it into a drawer against their
           * own open shift, and a rider who could post that movement would be
           * declaring cash into a till nobody had counted. What the journal row
           * gives the cashier is the other side of the reconciliation — what
           * the rider says they are carrying, stamped with the trading day they
           * were carrying it on.
           *
           * Queued, because a back door at eleven at night is where this gets
           * pressed. The server keys on `local_id`, so a drain that runs twice
           * declares once.
           */
          enqueue(t.handIn, `${rows.length}`, {
            kind: 'cash_handover',
            payload: { amount_tiyin: onHand, drops: rows.length },
          });

          void drain();
          flash(f.cashHandedIn);
        }}
        className="bg-acc mt-4 h-13 w-full rounded-[11px] py-3.5 text-sm font-semibold text-white disabled:opacity-45"
      >
        {handed ? t.handedIn : t.handIn}
      </button>

      {/* The sentence that decides how a courier thinks about the notes in
          their pocket for the rest of the shift. */}
      <Note>{t.cashNote}</Note>
    </>
  );
}
