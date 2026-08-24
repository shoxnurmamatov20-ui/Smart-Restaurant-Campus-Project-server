'use client';

import { useEffect, useState } from 'react';

import { flash } from '@restaurant/ui';

import { apiId, post } from '@/lib/console-post';

import { som } from '../../../(guest)/guest-session';
import { merchantCopy } from '../../merchant-copy';
import {
  MERCHANT_ORDERS,
  ORDER_ACTION,
  ORDER_AGO,
  ORDER_DELAY,
  ORDER_FILTERS,
  ORDER_FLASH,
  ORDER_KPIS,
  ORDER_STATE_LABEL,
  PAY_NOTE,
  say,
  type Lang,
  type MerchantQueueOrder,
  type OrderFilterKey,
  type OrderState,
  feeOf,
} from '../../merchant-data';
import { ReceiptSheet, RejectSheet } from '../../merchant-sheets';

/**
 * The ninety-second accept queue — `Do'kon paneli.dc.html:161-244`.
 *
 * The one screen the marketplace cannot work without, and the one this build
 * had least of. What was here: two orders, a clock, accept and decline. What
 * the design draws and what a merchant actually needs:
 *
 * **The whole ladder, not one decision.** `new → cooking → ready → done`, each
 * step offering the button that belongs to it: accept, then "Tayyor", then
 * "Kuryerga berildi". A queue that ends at "accept" is a kitchen and a courier
 * who never meet — the merchant accepted an order and then had nothing to press
 * while the food went cold on the pass.
 *
 * **Who ordered it and where it goes.** Name, address and the guest's note. The
 * note is the one that matters: "not spicy, there is a child" is unreadable
 * from a card that lists only dish names, and it is the difference between an
 * order and a dispute.
 *
 * **Three money lines, not two.** Items → commission 9% → what you receive,
 * plus what the payment method means for when the money arrives. Cash is the
 * reason that last line exists: the courier collects it, so the commission is
 * withheld from the payout instead, and a merchant who does not know reads the
 * Thursday statement as an error.
 *
 * **The countdown is the design's argument.** `slaP` says an order not accepted
 * within ninety seconds is cancelled by the guest, so the clock runs, the card
 * turns red under twenty seconds, and at zero the order settles as rejected
 * rather than sitting there offering a button that no longer works.
 */
const CHIP: Readonly<Record<OrderState, string>> = {
  new: 'bg-danger-50 text-danger-700',
  cooking: 'bg-warning-50 text-warning-700',
  ready: 'bg-brand-50 text-brand-700',
  done: 'bg-success-50 text-success-700',
  rejected: 'bg-bg-muted text-fg-muted',
};

const EDGE: Readonly<Record<OrderState, string>> = {
  new: 'border-l-danger-500',
  cooking: 'border-l-warning-500',
  ready: 'border-l-brand-500',
  done: 'border-l-success-500',
  rejected: 'border-l-border-strong',
};

const KPI_TONE = {
  success: 'text-success-700',
  neutral: 'text-fg-subtle',
  danger: 'text-danger-600',
} as const;

export function MerchantOrdersBoard({
  lang,
  orders = MERCHANT_ORDERS,
  live = false,
}: {
  lang: Lang;
  /** The queue, read on the server through `merchant-server.ts`. */
  orders?: readonly MerchantQueueOrder[];
  /**
   * Whether the rows above are this restaurant's or the design's sample.
   *
   * Marked on the page rather than left to be guessed at. A merchant panel that
   * quietly draws six invented orders when the API is unreachable is a merchant
   * cooking six dinners nobody ordered — the exact failure `renderWasDegraded()`
   * exists to make visible on the console, said here for a surface that has no
   * console shell to say it in.
   */
  live?: boolean;
}) {
  const money = (tiyin: number) => som(tiyin, lang);
  const t = merchantCopy(lang);

  const [filter, setFilter] = useState<OrderFilterKey>('all');
  const [moved, setMoved] = useState<Record<string, OrderState>>({});
  const [delays, setDelays] = useState<Record<string, number>>({});
  /*
   * The order itself rather than its id, because both sheets have to print it.
   * They used to look the id up in `MERCHANT_ORDERS`, which finds nothing once
   * the queue is this restaurant's: the rejection sheet lost the number and the
   * amount above its penalty warning, and the receipt sheet rendered `null` —
   * a button that opened nothing on every live order.
   */
  const [rejecting, setRejecting] = useState<MerchantQueueOrder | null>(null);
  const [receipt, setReceipt] = useState<MerchantQueueOrder | null>(null);

  const [clocks, setClocks] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      orders
        .filter((order) => order.secondsLeft !== undefined)
        .map((order) => [order.id, order.secondsLeft ?? 0]),
    ),
  );

  /*
   * One interval for the whole queue, not one per card.
   *
   * Three unanswered orders means three timers means three renders a second,
   * and this screen is open on a tablet in a kitchen all evening. The effect
   * has no dependency on the clocks it writes — it reads them through the
   * updater — so it subscribes once and never re-binds.
   */
  useEffect(() => {
    const id = setInterval(() => {
      setClocks((now) => {
        const next: Record<string, number> = {};
        let changed = false;

        for (const [key, value] of Object.entries(now)) {
          next[key] = Math.max(0, value - 1);
          if (next[key] !== value) changed = true;
        }

        return changed ? next : now;
      });
    }, 1_000);

    return () => clearInterval(id);
  }, []);

  const stateOf = (order: MerchantQueueOrder): OrderState => {
    const decided = moved[order.id];
    if (decided !== undefined) return decided;

    /* The design's own rule, applied rather than invented: an order nobody
       answered inside the window is not still waiting for an answer. */
    if (order.state === 'new' && (clocks[order.id] ?? 1) === 0) return 'rejected';

    return order.state;
  };

  /*
   * One rung of the ladder, pressed.
   *
   * The card moves before the answer arrives, because a tablet in a kitchen
   * that waits for a round trip before acknowledging a tap is a tablet that
   * gets tapped twice. What is different here from every other queue on this
   * platform is what happens when the answer is no: **the card moves back**.
   *
   * Everywhere else a settled row stays settled and the refusal is a toast — a
   * manager's verdict on a shift swap can be re-read tomorrow. This screen has
   * ninety seconds on it. An order that was not accepted must not sit in the
   * queue looking accepted while the guest's clock runs out, so a failure puts
   * the card back where it was, still counting, with its buttons live.
   *
   * `rung` is the server's word, which is not always the panel's: the board
   * draws five states where the ladder keeps nine. Accepting is the one press
   * that spans two of them, and the handler walks both — see the route.
   */
  function move(
    order: MerchantQueueOrder,
    to: OrderState,
    rung: string,
    told: string,
    reason?: string,
  ) {
    const before = moved[order.id];

    setMoved((now) => ({ ...now, [order.id]: to }));

    const id = apiId(order.id);

    /*
     * A sample row — the design's queue carries `o1`, `o2`. The toast is the
     * whole feature on a panel with no restaurant behind it, and the wrapper
     * above already says the figures are not this merchant's.
     */
    if (id === null) {
      flash(told);

      return;
    }

    void post(`/api/marketplace/orders/${id}`, { state: rung, reason }, lang).then((answer) => {
      if (answer.ok) {
        flash(told);

        return;
      }

      setMoved((now) => {
        const next = { ...now };

        if (before === undefined) delete next[order.id];
        else next[order.id] = before;

        return next;
      });

      flash.problem(answer.message ?? say(ORDER_FLASH.notSent!, lang));
    });
  }

  const shown = orders.filter((order) => {
    const state = stateOf(order);

    if (filter === 'all') return true;
    if (filter === 'new') return state === 'new';
    if (filter === 'active') return state === 'cooking' || state === 'ready';

    return state === 'done' || state === 'rejected';
  });

  return (
    <>
      {/*
        The whole screen, marked when it is drawing the design's sample rather
        than this restaurant's rows. On the wrapper rather than on one card,
        because "these figures are not yours" is true of everything below it —
        and a merchant panel that quietly shows six invented orders is a
        merchant cooking six dinners nobody ordered.
      */}
      <div data-demo={live ? undefined : ''} className="contents">
        {/* --------------------------------------------------------- figures */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ORDER_KPIS.map((kpi) => (
            <div
              key={kpi.key}
              className="border-border bg-surface rounded-[14px] border px-4.5 py-4"
            >
              <p className="text-fg-subtle text-xs font-medium">{say(kpi.label, lang)}</p>
              <p
                data-num
                className="font-display mt-1.5 text-[30px] leading-[1.05] font-bold tracking-tight"
              >
                {say(kpi.value, lang)}
              </p>
              <p data-num className={`mt-1 text-xs font-medium ${KPI_TONE[kpi.tone]}`}>
                {say(kpi.note, lang)}
              </p>
            </div>
          ))}
        </div>

        {/* --------------------------------------------------------- filters */}
        <div className="mt-5.5 mb-3.5 flex flex-wrap items-center gap-2">
          {ORDER_FILTERS.map((chip) => (
            <button
              key={chip.key}
              type="button"
              aria-pressed={filter === chip.key}
              onClick={() => setFilter(chip.key)}
              className={`rounded-pill h-[34px] border px-3.5 text-[13px] font-semibold ${
                filter === chip.key
                  ? 'border-fg bg-fg text-surface'
                  : 'border-border bg-surface text-fg-muted'
              }`}
            >
              {say(chip.label, lang)}
            </button>
          ))}

          <span className="flex-1" />

          <span data-num className="text-fg-subtle text-[13px]">
            {say(ORDER_FLASH.countOrders!, lang).replace('{n}', String(shown.length))}
          </span>
        </div>

        {shown.length === 0 ? (
          <div className="border-border bg-surface rounded-[14px] border px-6 py-11 text-center">
            <p className="text-[15px] font-semibold">{t.text.ordEmptyH}</p>
            <p className="text-fg-subtle mt-1 text-[13px] leading-normal">{t.text.ordEmptyP}</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {shown.map((order) => {
              const state = stateOf(order);
              const left = clocks[order.id] ?? 0;
              const urgent = state === 'new' && left <= 20;
              const cut = feeOf(order);
              const delay = delays[order.id] ?? 0;

              return (
                <article
                  key={order.id}
                  data-late={urgent ? 'true' : undefined}
                  className={`bg-surface rounded-[14px] border border-l-[3px] px-5 py-4.5 ${EDGE[state]}`}
                >
                  <div className="grid items-start gap-4.5 lg:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span
                          data-num
                          className="text-fg-muted font-mono text-[13px] font-semibold"
                        >
                          {order.number}
                        </span>

                        <span
                          className={`rounded-pill px-2.5 py-[3px] text-[11px] font-bold ${CHIP[state]}`}
                        >
                          {say(ORDER_STATE_LABEL[state], lang)}
                        </span>

                        {state === 'new' ? (
                          <span data-num className="text-danger-600 text-xs font-semibold">
                            {left} {say(ORDER_FLASH.seconds!, lang)}
                          </span>
                        ) : null}

                        {delay > 0 ? (
                          <span data-num className="text-warning-700 text-xs font-semibold">
                            {say(ORDER_DELAY.badge, lang).replace('{n}', String(delay))}
                          </span>
                        ) : null}

                        <span className="flex-1" />

                        <span data-num className="text-fg-subtle text-xs">
                          {say(state === 'done' ? ORDER_AGO.old : ORDER_AGO.fresh, lang)}
                        </span>
                      </div>

                      <p className="font-display mt-2 text-[17px] font-bold tracking-tight">
                        {order.customer}
                      </p>
                      <p className="text-fg-muted mt-0.5 text-[13px] leading-normal">
                        {say(order.address, lang)}
                      </p>

                      <ul className="mt-3 flex flex-col gap-0.5">
                        {order.lines.map((line) => (
                          <li key={say(line.name, lang)} className="flex gap-2.5 text-[13px]">
                            <span data-num className="text-brand-700 w-[22px] flex-none font-bold">
                              {line.quantity} ×
                            </span>
                            <span className="min-w-0 flex-1">{say(line.name, lang)}</span>
                            <span data-num className="text-fg-muted flex-none">
                              {money(line.amount)}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {order.note === undefined ? null : (
                        /* The guest's own words, in amber. This is the line that
                           turns into a dispute when the kitchen never sees it. */
                        <div className="border-warning-500/25 bg-warning-50 mt-3 flex items-start gap-2.5 rounded-[10px] border px-3 py-2.5">
                          <span
                            aria-hidden
                            className="bg-warning-500 mt-1.5 size-1.5 flex-none rounded-full"
                          />
                          <span className="text-warning-700 text-xs leading-normal font-medium">
                            {say(order.note, lang)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="bg-bg-muted rounded-xl px-4 py-3.5">
                        <MoneyRow label={t.text.colGross} value={money(order.gross)} />
                        <MoneyRow
                          label={`${t.text.colFee} ${cut.percent}%`}
                          value={`− ${money(cut.fee)}`}
                          tone="text-danger-600"
                        />
                        <MoneyRow label={t.text.colNet} value={money(cut.net)} strong />

                        <p className="border-border text-fg-subtle mt-2 border-t pt-2 text-[11px] leading-normal">
                          {say(PAY_NOTE[order.pay], lang)}
                        </p>
                      </div>

                      <div className="mt-3 grid gap-2">
                        {state === 'new' ? (
                          <>
                            <Action
                              label={say(ORDER_ACTION.accept!, lang)}
                              kind="primary"
                              onClick={() =>
                                move(order, 'cooking', 'accepted', say(ORDER_FLASH.accepted!, lang))
                              }
                            />
                            <Action
                              label={say(ORDER_ACTION.reject!, lang)}
                              kind="quiet"
                              onClick={() => setRejecting(order)}
                            />
                          </>
                        ) : null}

                        {state === 'cooking' ? (
                          <>
                            <Action
                              label={say(ORDER_ACTION.ready!, lang)}
                              kind="primary"
                              onClick={() =>
                                move(order, 'ready', 'ready', say(ORDER_FLASH.ready!, lang))
                              }
                            />
                            <Action
                              label={say(ORDER_ACTION.delay!, lang)}
                              kind="quiet"
                              onClick={() => {
                                const total = delay + ORDER_DELAY.step;
                                const id = apiId(order.id);

                                /*
                                 * The design's sample queue carries `o1`, `o2`
                                 * — the toast is the whole feature there, and
                                 * the wrapper above already says the figures
                                 * are not this merchant's.
                                 */
                                if (id === null) {
                                  setDelays((now) => ({ ...now, [order.id]: total }));
                                  flash(say(ORDER_DELAY.flash, lang).replace('{n}', String(total)));

                                  return;
                                }

                                /*
                                 * `PATCH /v1/marketplace/orders/{id}` with the
                                 * revised ETA and no rung — the order has not
                                 * moved, only what the restaurant promises.
                                 *
                                 * It used to update a local map and flash the
                                 * new total, so the merchant believed the guest
                                 * had been told and the guest's countdown never
                                 * changed. That is the entire point of the
                                 * button, which is why the toast now waits for
                                 * the answer.
                                 */
                                void post(
                                  `/api/marketplace/orders/${id}`,
                                  { etaMinutes: (order.etaMinutes ?? 0) + total },
                                  lang,
                                ).then((answer) => {
                                  if (!answer.ok) {
                                    flash.problem(
                                      answer.message ?? say(ORDER_FLASH.notSent!, lang),
                                    );

                                    return;
                                  }

                                  setDelays((now) => ({ ...now, [order.id]: total }));
                                  flash(say(ORDER_DELAY.flash, lang).replace('{n}', String(total)));
                                });
                              }}
                            />
                          </>
                        ) : null}

                        {state === 'ready' ? (
                          /*
                           * `courier_assigned` upstream, not `delivered`. The
                           * merchant's last rung is the hand-over — whether the
                           * food arrived is the courier's to report, and a panel
                           * that could close the bill on food still on a bicycle
                           * would be booking takings for a delivery nobody made.
                           */
                          <Action
                            label={say(ORDER_ACTION.handed!, lang)}
                            kind="outline"
                            onClick={() =>
                              move(
                                order,
                                'done',
                                'courier_assigned',
                                say(ORDER_FLASH.handed!, lang),
                              )
                            }
                          />
                        ) : null}

                        {state === 'done' ? (
                          <Action
                            label={say(ORDER_ACTION.receipt!, lang)}
                            kind="quiet"
                            onClick={() => setReceipt(order)}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Why the clock exists, in the design's own words. */}
        <section className="border-border bg-surface mt-5.5 rounded-[14px] border px-4.5 py-4">
          <p className="text-fg-subtle tracking-caps text-[11px] font-semibold uppercase">
            {t.text.slaH}
          </p>
          <p className="text-fg-muted mt-1.5 text-[13px] leading-relaxed">{t.text.slaP}</p>
        </section>

        {rejecting === null ? null : (
          <RejectSheet
            lang={lang}
            order={rejecting}
            /*
             * The reason goes up as its key — `stock`, `busy`, `closing`,
             * `addr` — rather than as the sentence the merchant read. It lands
             * in `reject_reason`, which is quoted back in a dispute months
             * later and read by somebody whose language is not necessarily the
             * one this panel was in.
             *
             * The ladder allows this only from `placed`: refusing an order
             * already cooking is a cancellation, and the acceptance rate the
             * platform judges a restaurant by should say so.
             */
            onReject={(why) =>
              move(rejecting, 'rejected', 'rejected', say(ORDER_FLASH.rejected!, lang), why)
            }
            onClose={() => setRejecting(null)}
          />
        )}

        {receipt === null ? null : (
          <ReceiptSheet lang={lang} order={receipt} onClose={() => setReceipt(null)} />
        )}
      </div>
    </>
  );
}

function MoneyRow({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: string;
  strong?: boolean;
}) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <span
        className={`${strong ? 'text-[19px] font-bold' : 'text-[13px] font-medium'} ${tone ?? ''}`}
      >
        {label}
      </span>
      <span
        data-num
        className={`flex-none ${strong ? 'font-display text-[19px] font-bold' : 'text-[13px] font-medium'} ${tone ?? ''}`}
      >
        {value}
      </span>
    </div>
  );
}

function Action({
  label,
  kind,
  onClick,
}: {
  label: string;
  kind: 'primary' | 'outline' | 'quiet';
  onClick: () => void;
}) {
  const SKIN = {
    primary: 'bg-brand-500 text-white',
    outline: 'border-border-strong bg-surface text-fg border',
    quiet: 'border-border bg-surface text-fg-muted border',
  } as const;

  return (
    <button
      type="button"
      onClick={onClick}
      data-press
      className={`h-[42px] w-full rounded-[10px] text-[13px] font-semibold ${SKIN[kind]}`}
    >
      {label}
    </button>
  );
}
