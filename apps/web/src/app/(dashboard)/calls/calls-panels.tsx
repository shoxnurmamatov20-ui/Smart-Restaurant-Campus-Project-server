'use client';

import Link from 'next/link';
import { useState } from 'react';
import { flash } from '@restaurant/ui';
import { formatTiyinAmount } from '@restaurant/utils';

import { apiId, post } from '@/lib/console-post';

import {
  AGGREGATORS,
  ASSIGN_TO,
  AUTOMATION_RULES,
  CALLS_COPY,
  CALLS_UI,
  CHANNEL_NAME,
  CHANNEL_ORDER,
  CHANNEL_ROWS,
  CHANNEL_TINT,
  COURIER_STATE,
  DELIVERY_FEE,
  INTAKE_AVERAGE,
  INTAKE_KPIS,
  KNOWN_CUSTOMER,
  PREP_OPTIONS,
  PREP_WARNING,
  QUEUE_STATE,
  afterCommission,
  say,
  type Assignment,
  type ChannelKey,
  type ComposeItem,
  type Courier,
  type Lang,
  type QueueOrder,
} from './calls-data';
import type {
  ComposeMenu,
  DeliveryBoard,
  IntakeQueue,
  IntakeRules,
  IntakeStats,
} from './calls-server';

/**
 * The five tabs of order intake, `Smart Restaurant OS.dc.html:3904-4245`.
 *
 * Three controls write. Accepting and declining a queue card go to
 * `POST /orders/orders/{id}/status` and `/cancel`; putting a rider on a
 * delivery goes to `POST /orders/orders/{id}/assign-courier`; and the compose
 * flow's first step reads a real customer off `GET /crm/customers`. All of them
 * travel through this app's own route handlers, because the session token is an
 * httpOnly cookie the browser cannot read.
 *
 * **Every control still moves, written or not.** An operator who taps *Qabul
 * qilish* and sees nothing happen concludes the console is broken, not that a
 * row was a fixture — so a card that has no id behind it still moves locally
 * and the toast still names what happened. What each handler cannot do yet is
 * written where it is, in the handler.
 *
 * The queue reads live too, and the two things that had to land first are worth
 * recording: `OrderResource` now publishes the four columns a card draws
 * (`customer_name`, `customer_phone`, `delivery.address`, `payment_state`) —
 * without them every card was *a number with four blanks under it* — and
 * `filter[intake]` separates an order waiting to be accepted from a table's
 * first ticket, which `status` never could, because a table's first order is
 * `placed` as well.
 *
 * Client components rather than server ones because all five tabs are stateful
 * in the design itself: `callChan`, `callDone`, `coCart`, `asgDone`, `aggOff`,
 * `chOff`, `chRules`, `chPrep`. There is nothing to render on the server that a
 * first click would not immediately replace.
 */

/* ------------------------------------------------------------------ pieces */

const CARD = 'bg-surface rounded-lg border';
const H3 = 'text-md font-semibold';

/** What is drawn where a figure is not available. U+2014, as everywhere else. */
const DASH = '—';

/**
 * A measured change, in the same three words in every language.
 *
 * A percentage is not translated and the minus is U+2212 rather than a hyphen —
 * the design sets figures in a face whose hyphen is a third the width of its
 * minus, and a mixed column looks misaligned.
 */
function signedPercent(value: number): { uz: string; ru: string; en: string } {
  const text = `${value >= 0 ? '+' : '−'}${Math.abs(Math.round(value * 10) / 10)}%`;

  return { uz: text, ru: text, en: text };
}

/** The design's 44×26 switch, `:4118`. */
function Switch({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`rounded-pill flex h-[26px] w-11 flex-none items-center border p-0.5 transition-all ${
        on
          ? 'bg-brand-500 border-brand-500 justify-end'
          : 'bg-bg-muted border-border-strong justify-start'
      }`}
    >
      <span className="size-5 rounded-full bg-white shadow-xs" />
    </button>
  );
}

/** The smaller 40×24 switch the rule list uses, `:4195`. */
function RuleSwitch({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`rounded-pill mt-0.5 flex h-6 w-10 flex-none items-center border p-0.5 transition-all ${
        on
          ? 'bg-brand-500 border-brand-500 justify-end'
          : 'bg-bg-muted border-border-strong justify-start'
      }`}
    >
      <span className="size-[18px] rounded-full bg-white shadow-xs" />
    </button>
  );
}

/* =================================================================== queue */

export function QueuePanel({
  lang,
  queue,
}: {
  lang: Lang;
  /*
   * Resolved on the server (`calls-server.ts`), like the courier board beside
   * it: a `use client` file cannot read the session cookie, and a fetch from
   * the browser would ask Laravel for the same list with no bearer on it.
   */
  queue: IntakeQueue;
}) {
  const [channel, setChannel] = useState<ChannelKey | 'all'>('all');
  const [done, setDone] = useState<Readonly<Record<string, 'ok' | 'no'>>>({});

  /**
   * Answer one card: yes to the kitchen, or no to the guest.
   *
   * The card moves first and the request follows. That is deliberate on this
   * screen and not on others: the operator is on the telephone with somebody
   * while they tap, and a button that waits for a round trip before it responds
   * is a button they tap twice. If the API refuses, its own sentence says so —
   * the card is corrected by the next load rather than snapping back under
   * their finger mid-sentence.
   *
   * A card with no row behind it is answered locally and nothing is sent.
   * `apiId()` is what tells them apart: the queue is fixtures today (see the
   * file's own note), and posting `#4821` as an id would be asking the API
   * about an order that does not exist.
   */
  async function answer(card: QueueOrder, verdict: 'ok' | 'no') {
    setDone((current) => ({ ...current, [card.id]: verdict }));

    // The row id, or nothing. A live card carries one; the design's eight do
    // not, and `apiId()` is the second reading for a board whose numbers happen
    // to be plain integers.
    const orderId = card.rowId ?? apiId(card.id);

    if (orderId === null) return;

    const sent = await post<unknown>(
      '/api/orders',
      { action: verdict === 'ok' ? 'accept' : 'decline', orderId },
      lang,
    );

    if (!sent.ok) flash.problem(sent.message ?? say(CALLS_UI.decline, lang));
  }

  const orders = queue.orders;

  const counts = orders.reduce<Record<string, number>>(
    (acc, order) => ({ ...acc, [order.channel]: (acc[order.channel] ?? 0) + 1 }),
    { all: orders.length },
  );

  const chips = [
    { key: 'all' as const, label: say(CALLS_UI.chipAll, lang), dot: 'var(--fg-subtle)' },
    ...CHANNEL_ORDER.map((key) => ({
      key,
      label: say(CHANNEL_NAME[key], lang),
      dot: CHANNEL_TINT[key].dot,
    })),
  ];

  const shown = orders.filter((order) => channel === 'all' || order.channel === channel);

  return (
    <>
      {/*
       * A demo board says so.
       *
       * Without the line, an operator on a console with no session reads eight
       * invented orders as their evening's work — and the accept button that
       * quietly does nothing is the part they find out about later. The other
       * live screens on this console carry the same admission.
       */}
      {queue.live ? null : (
        <div className="bg-bg-muted text-fg-muted mb-3.5 rounded-md px-3.5 py-2 text-xs font-medium">
          {say(CALLS_UI.demoQueue, lang)}
        </div>
      )}

      <div className="mb-3.5 flex flex-wrap gap-2">
        {chips.map((chip) => {
          const active = channel === chip.key;

          return (
            <button
              key={chip.key}
              type="button"
              data-press
              onClick={() => setChannel(chip.key)}
              className={`rounded-pill flex h-8 items-center gap-[7px] border px-[13px] text-sm ${
                active
                  ? 'bg-bg-muted border-border-strong text-fg font-semibold'
                  : 'bg-surface text-fg-muted font-medium'
              }`}
            >
              <span
                aria-hidden
                className="size-[7px] rounded-full"
                style={{ background: chip.dot }}
              />
              {chip.label}
              <span data-num className="text-fg-subtle font-medium">
                {counts[chip.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <div className={`${CARD} p-11 text-center`}>
          <p className="text-md font-medium">{say(CALLS_UI.emptyQueue, lang)}</p>
          <p className="text-fg-subtle mt-1.5 text-sm">{say(CALLS_UI.emptyQueueSub, lang)}</p>
        </div>
      ) : null}

      {shown.map((order) => {
        const decision = done[order.id];
        const state = decision === 'ok' ? 'acc' : order.state;
        const tint = CHANNEL_TINT[order.channel];
        const open = decision === undefined && order.state === 'nw';

        /*
         * State colours are the design's, `:10664`: new is brand, in the
         * kitchen is amber, on the way is the accent green, declined is red.
         * A declined card keeps its channel stripe — an operator scanning the
         * list still needs to know which door the refusal went back out of.
         */
        const badge =
          decision === 'no'
            ? { bg: 'var(--danger-50)', fg: 'var(--danger-700)', bd: 'rgba(240,68,56,.28)' }
            : state === 'nw'
              ? { bg: 'var(--brand-50)', fg: 'var(--brand-700)', bd: 'var(--brand-200)' }
              : state === 'acc'
                ? { bg: 'var(--warning-50)', fg: 'var(--warning-700)', bd: 'rgba(247,144,9,.28)' }
                : { bg: 'var(--accent-50)', fg: 'var(--accent-700)', bd: 'rgba(15,180,138,.28)' };

        return (
          <section
            key={order.id}
            className={`${CARD} mb-3 overflow-hidden`}
            style={{ borderLeft: `3px solid ${tint.dot}` }}
          >
            <div className="flex flex-wrap items-start justify-between gap-[18px] px-5 py-4">
              <div className="min-w-[220px] flex-1">
                <div className="flex flex-wrap items-center gap-[9px]">
                  <span
                    className="rounded-pill text-2xs inline-flex h-[22px] items-center gap-1.5 px-[9px] font-semibold"
                    style={{ background: tint.bg, color: tint.fg }}
                  >
                    <span
                      aria-hidden
                      className="size-[5px] rounded-full"
                      style={{ background: tint.dot }}
                    />
                    {say(CHANNEL_NAME[order.channel], lang)}
                  </span>

                  <span data-num className="text-fg-subtle font-mono text-sm">
                    {order.id}
                  </span>

                  <span
                    className="rounded-pill text-2xs inline-flex h-[22px] items-center border px-[9px] font-semibold"
                    style={{
                      background: badge.bg,
                      color: badge.fg,
                      borderColor: badge.bd,
                    }}
                  >
                    {decision === 'no'
                      ? say(CALLS_UI.declined, lang)
                      : say(QUEUE_STATE[state], lang)}
                  </span>
                </div>

                <div className="text-md tracking-snug mt-[9px] font-semibold">
                  {say(order.customer, lang)}
                </div>
                <div className="text-fg-muted mt-0.5 font-mono text-sm">{order.phone}</div>
                <div className="text-fg-muted mt-[7px] max-w-[420px] text-sm leading-normal">
                  {say(order.address, lang)}
                </div>
                <div className="text-fg-subtle mt-1.5 text-sm">
                  {order.items} {say(CALLS_COPY.items, lang)}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2.5">
                <div className="text-right">
                  <div data-num className="font-display tracking-snug text-xl font-bold">
                    {formatTiyinAmount(order.total, lang)} {say(CALLS_COPY.soum, lang)}
                  </div>
                  <div className="text-fg-subtle mt-0.5 text-xs">{say(order.pay, lang)}</div>
                </div>

                {/*
                 * The clock only exists while the answer is still owed. Once a
                 * ticket is in the kitchen the number would be a countdown to
                 * nothing, which is the design's `slaHide`.
                 */}
                {open && order.sla !== '—' ? (
                  <div className="flex items-center gap-[7px]">
                    <span className="text-fg-subtle text-xs">{say(CALLS_UI.waiting, lang)}</span>
                    <span
                      data-num
                      className={`text-md font-mono font-semibold ${
                        order.late ? 'text-danger-600' : 'text-fg-muted'
                      }`}
                    >
                      {order.sla}
                    </span>
                  </div>
                ) : null}

                {open ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      data-press
                      onClick={() => {
                        /*
                         * `POST /orders/orders/{id}/cancel`, with a reason the
                         * handler supplies. A void needs one — a row with no
                         * sentence beside it is what makes a loss report
                         * useless — and this is the one case where a constant
                         * is honest: a declined intake order has exactly one
                         * reason, which is that the operator declined it.
                         *
                         * The guest is told by the server, not from here.
                         * `Order::transitionTo()` publishes `orders.moved` and
                         * `Modules\Orders\Listeners\TellTheGuest` answers it
                         * — a text to the number on the bill and a push to
                         * whatever handset the guest registered.
                         *
                         * A decline is the one rung that deliberately sends
                         * nothing. The operator is on the telephone with the
                         * guest while they tap it, and a text arriving
                         * mid-sentence saying "your order was cancelled" reads
                         * as a second, colder refusal.
                         */
                        void answer(order, 'no');
                        flash(`${order.id} ${say(CALLS_COPY.declined, lang)}`);
                      }}
                      className="border-border-strong bg-surface text-fg-muted h-[34px] rounded-md border px-[13px] text-sm font-medium"
                    >
                      {say(CALLS_UI.decline, lang)}
                    </button>

                    <button
                      type="button"
                      data-press
                      onClick={() => {
                        /*
                         * `POST /orders/orders/{id}/status` with `accepted` —
                         * one rung of the ladder, chosen by the handler rather
                         * than named here. The kitchen ticket is written on the
                         * far side of it, which is why this is the one button
                         * on the tab another person acts on.
                         */
                        void answer(order, 'ok');
                        flash(`${order.id} ${say(CALLS_COPY.accepted, lang)}`);
                      }}
                      className="bg-brand-500 hover:bg-brand-600 h-[34px] rounded-md px-4 text-sm font-semibold text-white"
                    >
                      {say(CALLS_UI.accept, lang)}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}

/* ================================================================= compose */

/** What `GET /api/orders/customer` answers with, for one caller. */
type Caller = {
  id: number;
  name: string | null;
  visits: number;
  spend: number;
  /** ISO, or null for a guest who has never had a bill settled. */
  lastVisitAt: string | null;
  /** The dish on the top of their tally — `crm.customer_dishes`, denormalised. */
  usualOrder: string | null;
  /** Their default address, already assembled into one line by the API. */
  address: string | null;
};

/**
 * "last one four days ago", for the second line of the caller card.
 *
 * Days rather than a date, because that is what an operator says out loud while
 * the guest is still on the telephone — and because the sentence the design
 * writes ("oxirgisi 4 kun oldin") is a duration, not a stamp.
 */
function lastSeen(at: string | null, lang: Lang): string {
  if (at === null) return say(CALLS_COPY.lastSeenNever, lang);

  const then = Date.parse(at);

  if (Number.isNaN(then)) return say(CALLS_COPY.lastSeenNever, lang);

  const days = Math.max(0, Math.floor((Date.now() - then) / 86_400_000));

  return days === 0
    ? say(CALLS_COPY.lastSeenToday, lang)
    : say(CALLS_COPY.lastSeenDaysAgo, lang).replace('{n}', String(days));
}

/** The two letters in an avatar circle. Two words at most, or the badge overflows. */
function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter((part) => part !== '')
    .slice(0, 2)
    .map((part) => part.slice(0, 1))
    .join('')
    .toUpperCase();
}

export function ComposePanel({
  lang,
  menu,
  live,
}: {
  lang: Lang;
  /**
   * The eight tiles, from the catalogue when there is a session.
   *
   * The design's own eight carry word ids (`osh`, `lag`) and
   * `POST /orders/orders` takes a `menu_item_id`, so a fixture tile cannot
   * become a line — which is exactly what stops the demo console from sending
   * nonsense. See `calls-server.ts`.
   */
  menu: readonly ComposeItem[];
  /** False when those tiles are the design's rather than the restaurant's. */
  live: boolean;
}) {
  const [phone, setPhone] = useState('');
  const [lookup, setLookup] = useState<0 | 1 | 2>(0);
  /** The real caller, when the lookup found one. Null keeps the design's own. */
  const [caller, setCaller] = useState<Caller | null>(null);
  const [looking, setLooking] = useState(false);
  const [cart, setCart] = useState<Readonly<Record<string, number>>>({});
  const [delivery, setDelivery] = useState(true);
  const [pay, setPay] = useState<'cash' | 'card' | 'click'>('cash');
  const [sending, setSending] = useState(false);

  const lines = menu.filter((item) => (cart[item.id] ?? 0) > 0);
  const subtotal = lines.reduce((sum, item) => sum + item.price * (cart[item.id] ?? 0), 0);
  const fee = delivery && subtotal > 0 ? DELIVERY_FEE : 0;
  const soum = say(CALLS_COPY.soum, lang);

  /**
   * Who is on the telephone — `GET /crm/customers?filter[phone]=`.
   *
   * The number is normalised to `+998` and the last nine digits, because the
   * CRM filter is an exact match: a phone number is an identity, and a partial
   * one would offer the operator somebody else's account for sharing six
   * digits. An operator types it however they like — spaces, a leading 8, the
   * country code or not — and only the nine that identify a line survive.
   *
   * Falls back to the design's own rule when there is no session or the API
   * does not answer (`:10925` — a number containing "90" is the known
   * customer). That keeps the demo console demonstrating rather than showing a
   * failure on the first field of the first step.
   */
  async function runLookup() {
    const digits = phone.replace(/\D/g, '');

    if (digits.length < 9) {
      flash.problem(say(CALLS_COPY.needFullPhone, lang));

      return;
    }

    setLooking(true);

    try {
      const response = await fetch(
        `/api/orders/customer?phone=${encodeURIComponent(`+998${digits.slice(-9)}`)}`,
      );

      if (response.ok) {
        const body = (await response.json()) as { data: Caller | null };

        setCaller(body.data);
        setLookup(body.data === null ? 2 : 1);
        flash(say(body.data === null ? CALLS_COPY.notFound : CALLS_COPY.found, lang));

        return;
      }
    } catch {
      // The network, not an answer. Handled the same way as a refusal below.
    } finally {
      setLooking(false);
    }

    const hit = digits.includes('90') ? 1 : 2;

    setCaller(null);
    setLookup(hit);
    flash(say(hit === 1 ? CALLS_COPY.found : CALLS_COPY.notFound, lang));
  }

  /**
   * The card the lookup draws: the real caller when there is one.
   *
   * All four lines are answerable now. `last_visit_at` and `usual_order` are
   * columns on `crm.customers` (`2026_08_22_180000`) — the first written by the
   * listener that hears `orders.paid`, the second the top row of that guest's
   * dish tally — and the address comes from
   * `GET /crm/customers/{id}/addresses`, asked for separately so the guest list
   * does not pay for a read only this screen makes.
   *
   * A line the API cannot answer is still drawn as nothing rather than as the
   * demo's sentence. Inventing an address for somebody who is about to be asked
   * for theirs was the failure this card was built to avoid.
   */
  const known =
    caller === null
      ? {
          initials: KNOWN_CUSTOMER.initials,
          name: KNOWN_CUSTOMER.name,
          meta: `${KNOWN_CUSTOMER.orders} ${say(KNOWN_CUSTOMER.meta, lang)}`,
          address: say(KNOWN_CUSTOMER.address, lang),
          favourite: say(KNOWN_CUSTOMER.favourite, lang),
          spend: KNOWN_CUSTOMER.spend,
        }
      : {
          initials: initialsOf(caller.name ?? ''),
          // A customer with no name on file is still a customer, and the number
          // is what the operator has in front of them.
          name: caller.name ?? phone,
          meta: `${caller.visits} ${say(CALLS_COPY.orders, lang)} · ${lastSeen(caller.lastVisitAt, lang)}`,
          address: caller.address,
          favourite:
            caller.usualOrder === null
              ? null
              : `${say(CALLS_COPY.usuallyOrders, lang)} ${caller.usualOrder}`,
          spend: caller.spend,
        };

  const segment = (active: boolean) =>
    `h-[34px] flex-1 rounded-lg text-sm font-medium ${
      active ? 'bg-surface text-fg shadow-xs' : 'text-fg-muted bg-transparent'
    }`;

  /**
   * The order, in one request — `POST /orders/orders` through this app's own
   * handler.
   *
   * One call and not one per line, and that is the shape the endpoint grew for
   * this screen: an operator builds a cart while the guest is still on the
   * telephone, and a connection that dropped between line two and line three
   * would leave a half-order on a pass with a guest expecting the whole thing.
   * The server writes every line or the order does not exist.
   *
   * What is deliberately NOT sent is a price. The catalogue is asked per line,
   * on the server, exactly as it is for a guest ordering from their own phone —
   * an operator is trusted with a discount, which goes through the approval
   * ladder, and not with a total, which does not.
   *
   * `source: 'pos'` and `intake_channel: 'phone'` are two different axes and
   * both are true: the software that posted it is the till console, and the
   * conversation was a telephone call. See `OrderResource` for why neither can
   * be derived from the other.
   *
   * Nothing is cleared until the server answers. A cart wiped by a request that
   * was then refused is an operator asking the guest to read their order out
   * again.
   */
  async function send() {
    const items = lines
      .map((item) => ({ menuItemId: item.menuItemId, quantity: cart[item.id] ?? 0 }))
      .filter(
        (line): line is { menuItemId: number; quantity: number } =>
          typeof line.menuItemId === 'number',
      );

    // A fixture menu, so there is nothing real to write. The toast still names
    // the total: an operator who taps *Yuborish* and sees nothing happen
    // concludes the console is broken, not that a tile was a drawing.
    if (items.length === 0) {
      flash(
        `${say(CALLS_COPY.sentToKitchen, lang)}${formatTiyinAmount(subtotal + fee, lang)} ${soum}`,
      );
      clear();

      return;
    }

    setSending(true);

    const sent = await post<unknown>(
      '/api/orders',
      {
        action: 'create',
        items,
        delivery,
        payment: pay,
        customerName: caller?.name ?? null,
        customerPhone: phone.trim() === '' ? null : phone.trim(),
        address: delivery ? (caller?.address ?? null) : null,
        deliveryFee: fee,
      },
      lang,
    );

    setSending(false);

    if (!sent.ok) {
      flash.problem(sent.message ?? say(CALLS_COPY.pickDishesFirst, lang));

      return;
    }

    flash(
      `${say(CALLS_COPY.sentToKitchen, lang)}${formatTiyinAmount(subtotal + fee, lang)} ${soum}`,
    );
    clear();
  }

  /** Back to an empty desk, ready for the next call. */
  function clear() {
    setCart({});
    setPhone('');
    setLookup(0);
    setCaller(null);
  }

  return (
    <div
      data-split
      className="grid [grid-template-columns:minmax(0,1fr)_380px] items-start gap-[18px]"
    >
      <div className="grid gap-4">
        {/* ------------------------------------------------------- step one */}
        <section className={`${CARD} p-5`}>
          <h3 className={`${H3} mb-[3px]`}>{say(CALLS_UI.step1, lang)}</h3>
          <p className="text-fg-subtle mb-[15px] text-sm">{say(CALLS_UI.step1Sub, lang)}</p>

          <div className="flex flex-wrap gap-2.5">
            <label className="min-w-[220px] flex-1">
              <span className="sr-only">{say(CALLS_UI.step1, lang)}</span>
              <input
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setLookup(0);
                  setCaller(null);
                }}
                placeholder="+998 90 123 45 67"
                inputMode="tel"
                className="border-border-strong bg-surface text-fg text-md h-[42px] w-full rounded-md border px-[13px] font-mono"
              />
            </label>

            <button
              type="button"
              data-press
              disabled={looking}
              onClick={() => void runLookup()}
              className="border-border-strong bg-bg-subtle text-fg h-[42px] rounded-md border px-[18px] text-sm font-semibold disabled:opacity-60"
            >
              {say(CALLS_UI.lookUp, lang)}
            </button>
          </div>

          {lookup === 1 ? (
            <div className="border-brand-200 bg-brand-50 mt-3.5 flex flex-wrap items-start gap-3.5 rounded-md border p-4">
              <span className="bg-brand-500 grid size-[38px] flex-none place-items-center rounded-full text-sm font-semibold text-white">
                {known.initials}
              </span>

              <div className="min-w-[180px] flex-1">
                <div className="text-md font-semibold">{known.name}</div>
                <div className="text-fg-muted mt-[3px] text-sm">{known.meta}</div>
                {known.address === null ? null : (
                  <div className="text-fg-muted mt-[7px] text-sm leading-normal">
                    {known.address}
                  </div>
                )}
                {known.favourite === null ? null : (
                  <div className="text-brand-700 mt-[7px] text-sm font-medium">
                    {known.favourite}
                  </div>
                )}
              </div>

              <div className="text-right">
                <div data-num className="font-display text-xl font-bold">
                  {formatTiyinAmount(known.spend, lang)}
                </div>
                <div className="text-fg-subtle mt-0.5 text-xs">
                  {say(CALLS_UI.lifetimeSpend, lang)}
                </div>
              </div>
            </div>
          ) : null}

          {lookup === 2 ? (
            <div className="border-border-strong bg-bg-subtle mt-3.5 rounded-md border border-dashed px-4 py-3.5">
              <div className="text-sm font-semibold">{say(CALLS_UI.newCustomer, lang)}</div>
              <div className="text-fg-muted mt-[3px] text-sm">
                {say(CALLS_UI.newCustomerSub, lang)}
              </div>
            </div>
          ) : null}
        </section>

        {/* ------------------------------------------------------- step two */}
        <section className={`${CARD} p-5`}>
          <h3 className={`${H3} mb-[3px]`}>{say(CALLS_UI.step2, lang)}</h3>
          <p className="text-fg-subtle mb-[15px] text-sm">{say(CALLS_UI.step2Sub, lang)}</p>

          {/*
            A live catalogue with nothing sellable in it says so and points at
            the menu. It used to hand the operator the design's eight dishes —
            food this kitchen cannot cook, at prices nobody set — while somebody
            was on the telephone waiting to order one of them.
          */}
          {live && menu.length === 0 ? (
            <div className="border-border-strong bg-bg-subtle rounded-md border border-dashed px-4 py-3.5">
              <p className="text-fg-muted text-sm leading-normal">
                {say(CALLS_UI.composeEmpty, lang)}
              </p>
              <Link href="/menu" className="text-fg-brand mt-2 inline-block text-sm font-semibold">
                {say(CALLS_UI.composeOpenMenu, lang)}
              </Link>
            </div>
          ) : (
            <div className="grid [grid-template-columns:repeat(auto-fill,minmax(min(190px,100%),1fr))] gap-2.5">
              {menu.map((item) => {
                const quantity = cart[item.id] ?? 0;

                return (
                  <button
                    key={item.id}
                    type="button"
                    data-tile
                    onClick={() =>
                      setCart((current) => ({ ...current, [item.id]: (current[item.id] ?? 0) + 1 }))
                    }
                    className={`flex items-center justify-between gap-2.5 rounded-md border px-3.5 py-[13px] text-left ${
                      quantity > 0 ? 'border-brand-300 bg-brand-50' : 'bg-surface'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="text-fg block text-sm font-semibold">
                        {say(item.name, lang)}
                      </span>
                      <span data-num className="text-fg-muted mt-[3px] block text-sm">
                        {formatTiyinAmount(item.price, lang)}
                      </span>
                    </span>

                    <span
                      data-num
                      className={`grid size-[26px] flex-none place-items-center rounded-sm text-sm font-bold ${
                        quantity > 0 ? 'bg-brand-500 text-white' : 'bg-bg-muted text-fg-subtle'
                      }`}
                    >
                      {quantity > 0 ? quantity : '+'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ----------------------------------------------------- step three */}
        <section className={`${CARD} p-5`}>
          <h3 className={`${H3} mb-[15px]`}>{say(CALLS_UI.step3, lang)}</h3>

          <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-[18px]">
            <div>
              <div className="text-fg-subtle mb-2 text-xs font-semibold tracking-wide">
                {say(CALLS_UI.orderType, lang)}
              </div>
              <div className="bg-bg-muted flex gap-[2px] rounded-md p-[3px]">
                <button
                  type="button"
                  data-seg
                  data-active={delivery ? 'true' : undefined}
                  onClick={() => setDelivery(true)}
                  className={segment(delivery)}
                >
                  {say(CALLS_UI.deliver, lang)}
                </button>
                <button
                  type="button"
                  data-seg
                  data-active={delivery ? undefined : 'true'}
                  onClick={() => setDelivery(false)}
                  className={segment(!delivery)}
                >
                  {say(CALLS_UI.pickup, lang)}
                </button>
              </div>
            </div>

            <div>
              <div className="text-fg-subtle mb-2 text-xs font-semibold tracking-wide">
                {say(CALLS_UI.payHow, lang)}
              </div>
              <div className="bg-bg-muted flex gap-[2px] rounded-md p-[3px]">
                {(
                  [
                    ['cash', say(CALLS_UI.payCash, lang)],
                    ['card', say(CALLS_UI.payCard, lang)],
                    ['click', 'Click'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    data-seg
                    data-active={pay === key ? 'true' : undefined}
                    onClick={() => setPay(key)}
                    className={segment(pay === key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ------------------------------------------------------------- cart */}
      <section data-sticky className={`${CARD} sticky top-5 p-5`}>
        <h3 className={`${H3} mb-3.5`}>{say(CALLS_UI.cart, lang)}</h3>

        {lines.length === 0 ? (
          <p className="text-fg-subtle text-sm leading-normal">{say(CALLS_UI.cartEmpty, lang)}</p>
        ) : null}

        {lines.map((item) => {
          const quantity = cart[item.id] ?? 0;

          return (
            <div
              key={item.id}
              className="border-divider flex items-center gap-2.5 border-b py-[9px]"
            >
              <span className="min-w-0 flex-1 text-sm font-medium">{say(item.name, lang)}</span>

              <button
                type="button"
                aria-label="−"
                onClick={() =>
                  setCart((current) => {
                    const next = { ...current };

                    if ((next[item.id] ?? 0) > 1) next[item.id] = (next[item.id] ?? 0) - 1;
                    else delete next[item.id];

                    return next;
                  })
                }
                className="border-border-strong bg-surface text-fg-muted text-md size-[26px] flex-none rounded-sm border leading-none"
              >
                −
              </button>

              <span data-num className="w-5 text-center text-sm font-semibold">
                {quantity}
              </span>

              <button
                type="button"
                aria-label="+"
                onClick={() =>
                  setCart((current) => ({ ...current, [item.id]: (current[item.id] ?? 0) + 1 }))
                }
                className="border-border-strong bg-surface text-fg-muted text-md size-[26px] flex-none rounded-sm border leading-none"
              >
                +
              </button>

              <span data-num className="w-[78px] text-right text-sm font-semibold">
                {formatTiyinAmount(item.price * quantity, lang)}
              </span>
            </div>
          );
        })}

        <div className="text-fg-muted mt-3.5 flex justify-between text-sm">
          <span>{say(CALLS_UI.subtotal, lang)}</span>
          <span data-num>
            {formatTiyinAmount(subtotal, lang)} {soum}
          </span>
        </div>

        <div className="text-fg-muted mt-[7px] flex justify-between text-sm">
          <span>{say(CALLS_UI.deliveryFee, lang)}</span>
          <span data-num>{fee > 0 ? `${formatTiyinAmount(fee, lang)} ${soum}` : '—'}</span>
        </div>

        <div className="mt-[13px] flex items-baseline justify-between border-t pt-[13px]">
          <span className="text-sm font-semibold">{say(CALLS_UI.total, lang)}</span>
          <span data-num className="font-display text-2xl font-bold tracking-tight">
            {formatTiyinAmount(subtotal + fee, lang)} {soum}
          </span>
        </div>

        <div className="text-fg-subtle mt-2 text-xs">
          {say(delivery ? CALLS_COPY.etaDelivery : CALLS_COPY.etaPickup, lang)}
        </div>

        <button
          type="button"
          data-press
          onClick={() => {
            if (lines.length === 0) {
              flash.problem(say(CALLS_COPY.pickDishesFirst, lang));

              return;
            }

            void send();
          }}
          disabled={sending}
          className="bg-brand-500 hover:bg-brand-600 text-md mt-4 h-[46px] w-full rounded-md font-semibold text-white disabled:opacity-60"
        >
          {say(sending ? CALLS_UI.sending : CALLS_UI.send, lang)}
        </button>

        <button
          type="button"
          onClick={clear}
          className="border-border-strong bg-surface text-fg-muted mt-[9px] h-[38px] w-full rounded-md border text-sm font-medium"
        >
          {say(CALLS_UI.clear, lang)}
        </button>
      </section>
    </div>
  );
}

/* ================================================================ delivery */

/**
 * The one tab with a live half.
 *
 * Riders and unassigned orders arrive as props rather than being read off
 * `calls-data.ts`, because `./calls-server.ts` resolves them: the API's board
 * when there is a session, the design's own five and three otherwise. The other
 * four tabs still read the module directly — there is nothing yet to read them
 * from.
 */
export function DeliveryPanel({
  lang,
  couriers,
  toAssign,
  orderIds = {},
  assignTo = null,
  riders = [],
}: {
  lang: Lang;
  couriers: readonly Courier[];
  toAssign: readonly Assignment[];
  /** Order number → row id. Empty when these three are the design's own. */
  orderIds?: Readonly<Record<string, number>>;
  /** The rider the board suggests — see `DeliveryBoard.assignTo`. */
  assignTo?: { id: number; name: string } | null;
  /** Everybody on the board, for the card that needs a different one. */
  riders?: readonly { id: number; name: string }[];
}) {
  const [assigned, setAssigned] = useState<readonly string[]>([]);
  /** Which card has its rider list open, by order number. One at a time. */
  const [picking, setPicking] = useState<string | null>(null);

  /**
   * Put this order on a rider — `POST /orders/orders/{id}/assign-courier`.
   *
   * The design's button is one tap and assigns to one name (`ASSIGN_TO`,
   * `:10783`), so the screen has to arrive with a suggestion; `calls-server.ts`
   * picks the least-loaded rider who is not mid-delivery. Reassignment is the
   * same call — a rider who breaks down hands the bag over and the row is
   * updated rather than duplicated — so tapping twice is not a second trip.
   *
   * The card moves first for the same reason the queue's does: an operator is
   * on the telephone while they tap. A refusal is reported with the API's own
   * sentence, which is the one that says *why* — a rider who signed off, an
   * order that is no longer a delivery.
   *
   * Choosing a DIFFERENT rider is the second control on the card, and it is
   * deliberately second. The design draws one button and one name because that
   * is the normal case — the board already picked the least-loaded rider who is
   * standing free — but a rider who breaks down hands the bag over, and an
   * operator on the telephone must be able to say so without opening another
   * screen. So the suggestion stays the tap, and the list is one tap further:
   * `Boshqa kuryer` opens the roster, and picking a name assigns to that name.
   *
   * The list is deliberately everybody, including whoever is mid-delivery.
   * `suggest()` never offers them, because stacking a third drop on a rider
   * while another stands at the door is how the two-minute order arrives cold —
   * but an operator may know the scooter is two streets from this address
   * anyway, and a default is not a rule.
   */
  async function assign(job: Assignment, rider: { id: number; name: string } | null) {
    setPicking(null);
    setAssigned((current) => [...current, job.id]);

    const orderId = orderIds[job.id];

    // A fixture board, or no rider standing free. Either way there is nothing
    // to send: posting `#4821` as an id would ask about an order that does not
    // exist, and an assignment with no rider is not an assignment.
    if (orderId === undefined || rider === null) return;

    const sent = await post<unknown>(
      '/api/orders',
      { action: 'courier', orderId, courierId: rider.id },
      lang,
    );

    if (!sent.ok) flash.problem(sent.message ?? `${job.id} → ${rider.name}`);
  }

  return (
    <div
      data-split
      className="grid [grid-template-columns:minmax(0,1.35fr)_minmax(0,1fr)] items-start gap-[18px]"
    >
      <section className={`${CARD} overflow-hidden`}>
        <div className="border-divider border-b px-5 pt-4 pb-3.5">
          <h3 className={H3}>{say(CALLS_UI.couriers, lang)}</h3>
          <p className="text-fg-subtle mt-1 text-xs">{say(CALLS_UI.couriersSub, lang)}</p>
        </div>

        {couriers.map((courier) => {
          const state = COURIER_STATE[courier.state];

          return (
            <div
              key={courier.name}
              data-row
              className="border-divider flex items-center gap-3.5 border-b px-5 py-3.5"
            >
              <span className="bg-bg-muted text-fg-muted grid size-9 flex-none place-items-center rounded-full text-sm font-semibold">
                {courier.initials}
              </span>

              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{courier.name}</div>
                <div className="text-fg-subtle mt-0.5 text-xs">{say(courier.vehicle, lang)}</div>
              </div>

              <div className="min-w-[96px] text-right">
                <span
                  className="rounded-pill text-2xs inline-flex h-[22px] items-center gap-1.5 px-[9px] font-semibold"
                  style={{ background: state.bg, color: state.fg }}
                >
                  <span
                    aria-hidden
                    className="size-[5px] rounded-full"
                    style={{ background: state.dot }}
                  />
                  {say(state.label, lang)}
                </span>

                <div data-num className="text-fg-subtle mt-[5px] text-xs">
                  {courier.load > 0
                    ? `${courier.load} ${say(CALLS_COPY.orders, lang)}`
                    : say(CALLS_COPY.noLoad, lang)}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className={`${CARD} overflow-hidden`}>
        <div className="border-divider border-b px-5 pt-4 pb-3.5">
          <h3 className={H3}>{say(CALLS_UI.toAssign, lang)}</h3>
          <p className="text-fg-subtle mt-1 text-xs">{say(CALLS_UI.toAssignSub, lang)}</p>
        </div>

        {toAssign.map((job) => {
          const taken = assigned.includes(job.id);

          return (
            <div key={job.id} data-row className="border-divider border-b px-5 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <span data-num className="text-fg-subtle font-mono text-sm">
                  {job.id}
                </span>
                <span data-num className="text-sm font-semibold">
                  {formatTiyinAmount(job.total, lang)} {say(CALLS_COPY.soum, lang)}
                </span>
              </div>

              <div className="mt-1.5 text-sm leading-normal">{say(job.address, lang)}</div>

              <div className="mt-2.5 flex items-center justify-between gap-3">
                <span
                  className={`text-xs font-medium ${
                    taken ? 'text-success-600' : job.late ? 'text-danger-600' : 'text-fg-subtle'
                  }`}
                >
                  {taken ? say(CALLS_COPY.assignedTo, lang) : say(job.due, lang)}
                </span>

                <div className="flex flex-none items-center gap-1.5">
                  {/*
                   * The design's one button, unchanged: one tap, one name. The
                   * suggestion is the board's — least-loaded rider standing
                   * free — and it is what an operator presses nine times in ten.
                   */}
                  <button
                    type="button"
                    data-press
                    disabled={taken}
                    onClick={() => {
                      void assign(job, assignTo);
                      flash(`${job.id} → ${assignTo?.name ?? ASSIGN_TO}`);
                    }}
                    className="border-border-strong bg-surface text-fg h-8 rounded-md border px-3.5 text-sm font-semibold disabled:opacity-60"
                  >
                    {taken ? say(CALLS_COPY.assigned, lang) : say(CALLS_COPY.assign, lang)}
                  </button>

                  {/*
                   * And the tenth. Drawn only when there is a roster to choose
                   * from — a demo board has none, and a chevron that opens an
                   * empty list is a control that lies.
                   */}
                  {taken || riders.length === 0 ? null : (
                    <button
                      type="button"
                      data-press
                      aria-label={say(CALLS_UI.otherRider, lang)}
                      aria-expanded={picking === job.id}
                      onClick={() => setPicking(picking === job.id ? null : job.id)}
                      className="border-border-strong bg-surface text-fg-muted grid h-8 w-8 place-items-center rounded-md border text-sm font-semibold"
                    >
                      ⋯
                    </button>
                  )}
                </div>
              </div>

              {picking === job.id ? (
                <div className="border-divider mt-2.5 grid gap-1 rounded-md border p-1.5">
                  <div className="text-fg-subtle px-1.5 pt-0.5 pb-1 text-xs font-semibold">
                    {say(CALLS_UI.otherRider, lang)}
                  </div>

                  {riders.map((rider) => (
                    <button
                      key={rider.id}
                      type="button"
                      data-press
                      onClick={() => {
                        void assign(job, rider);
                        flash(`${job.id} → ${rider.name}`);
                      }}
                      className="hover:bg-bg-muted rounded-sm px-1.5 py-1.5 text-left text-sm font-medium"
                    >
                      {rider.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </section>
    </div>
  );
}

/* ============================================================= aggregators */

/**
 * The three aggregator integrations, as they actually stand.
 *
 * This panel used to draw Yandex Eats and Uzum Tezkor as *connected*, with 34
 * and 21 orders today, 6.2M and 3.8M taken and an 18% commission — beside an
 * auto-accept switch that wrote nothing but React state. A restaurant that has
 * signed no aggregator contract was being told two of them had delivered 55
 * orders on its behalf.
 *
 * There is no aggregator endpoint anywhere in `apps/api/openapi.json`, and what
 * is missing is not code: it is a contract with each of the three, and the
 * platform keys that come with one. So the honest panel is the list of what
 * could be connected, said plainly, with no figures under it and no switch
 * claiming to change a setting that reaches no server.
 *
 * The shapes those endpoints will answer with stay in `calls-data.ts`, and
 * `AGGREGATORS` keeps the names — the three are a fact about the market, not a
 * fact about this restaurant.
 */
export function AggregatorsPanel({ lang }: { lang: Lang }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-fg-muted text-sm leading-normal">{say(CALLS_UI.aggNone, lang)}</p>

      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4">
        {AGGREGATORS.map((agg) => (
          <section key={agg.key} className={`${CARD} p-5`}>
            <h3 className={H3}>{agg.name}</h3>

            <div className="mt-[7px] flex items-center gap-[7px]">
              <span
                aria-hidden
                className="size-[7px] rounded-full"
                style={{ background: 'var(--n-400)' }}
              />
              <span className="text-fg-subtle text-sm font-medium">
                {say(CALLS_COPY.notConnected, lang)}
              </span>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/* ================================================================ channels */

/**
 * A channel row's key against the lane word `orders.intake_channel` records.
 *
 * Two vocabularies for one list, and they cannot be merged: the design's rows
 * are keyed `web · tg · tel · ye · uz · wo` and the column stores
 * `site · telegram · phone · yandex · uzum · wolt`. This is the only place the
 * two meet.
 */
const ROW_LANE: Readonly<Record<string, string>> = {
  web: 'site',
  tg: 'telegram',
  tel: 'phone',
  ye: 'yandex',
  uz: 'uzum',
  wo: 'wolt',
};

export function ChannelsPanel({
  lang,
  stats,
  rules: saved,
}: {
  lang: Lang;
  stats: IntakeStats;
  rules: IntakeRules;
}) {
  const [off, setOff] = useState<Readonly<Record<string, boolean>>>({});

  /**
   * Shut one door, or open it again.
   *
   * `orders.channel_settings` is keyed by INTAKE SOURCE — the telephone, the
   * bot, the website, Yandex Eats, Uzum Tezkor — which is what these five
   * switches are. `settings.channels` was the obvious place and is the wrong
   * list: its four values are the FULFILMENT channels an order row can hold, so
   * two of the five switches would have written `aggregator` and one would have
   * written nothing, and switching Uzum off would have taken Yandex with it.
   *
   * Three of the five are enforced: an order that arrives at
   * `POST /api/v1/public/orders` through a shut door is refused with
   * `order.channel_paused`. The two aggregators store the restaurant's
   * intention and are paused through their own APIs —
   * TODO(integration): needs YANDEX_EATS_TOKEN / UZUM_TEZKOR_TOKEN — see
   * docs/GO-LIVE.md.
   *
   * Optimistic, and the failure path puts the switch back. A switch that stayed
   * where the reader left it while the server held the opposite is the worst
   * outcome on a screen whose whole job is to say which doors are open.
   */
  async function flip(key: string, name: string, wasOn: boolean) {
    setOff((current) => ({ ...current, [key]: wasOn }));

    const told = `${name} · ${say(wasOn ? CALLS_COPY.channelOff : CALLS_COPY.channelOn, lang)}`;
    const answer = await post('/api/orders/channels', { key, isOpen: !wasOn }, lang);

    if (!answer.ok) {
      // The demo console has no session and no rows; it keeps confirming, which
      // is what `session.live === false` on the shell already says.
      if (answer.code === 'offline' || answer.code === 'not_signed_in') {
        flash(told);

        return;
      }

      setOff((current) => ({ ...current, [key]: !wasOn }));
      flash.problem(answer.message ?? told);

      return;
    }

    flash(told);
  }
  /*
   * The desk's own rules, from the venue rather than from the design.
   *
   * `useState(initial)` rather than an effect: the value arrives with the
   * render, and a switch that started at the design's default and then jumped
   * to the venue's after hydration would be a switch a reader saw in two
   * positions.
   */
  const [rules, setRules] = useState<Readonly<Record<string, boolean>>>(saved.rules);
  const [prep, setPrep] = useState(saved.prepMinutes);

  /**
   * Flip one automation rule.
   *
   * Optimistic, and the failure path puts the switch back — the same shape as
   * `flip()` above, and for the same reason: a switch that stayed where the
   * reader left it while the server held the opposite is the worst outcome on
   * a screen whose whole job is to say what happens automatically.
   *
   * The toast says which of the two kinds of switch this was. Three of the four
   * are recorded intentions the server does not yet act on, and telling
   * somebody "auto-accept is on" when nothing accepts anything is how an
   * unanswered queue happens.
   */
  async function flipRule(key: string, name: string, wasOn: boolean) {
    setRules((current) => ({ ...current, [key]: !wasOn }));

    const told = `${name} · ${say(wasOn ? CALLS_COPY.channelOff : CALLS_COPY.channelOn, lang)}`;
    const answer = await post('/api/orders/intake-rules', { rule: key, on: !wasOn }, lang);

    if (!answer.ok) {
      if (answer.code === 'offline' || answer.code === 'not_signed_in') {
        flash(told);

        return;
      }

      setRules((current) => ({ ...current, [key]: wasOn }));
      flash.problem(answer.message ?? told);

      return;
    }

    flash(saved.enforced[key] === true ? told : `${told} · ${say(CALLS_UI.ruleNoted, lang)}`);
  }

  /**
   * Quote a different prep time.
   *
   * The one number on this card a guest actually sees — it is printed on the
   * site, in Telegram and at the aggregators — so it is written rather than
   * remembered, and the old value comes back if the server refuses.
   */
  async function choosePrep(minutes: number) {
    const previous = prep;

    setPrep(minutes);

    const answer = await post('/api/orders/intake-rules', { prepMinutes: minutes }, lang);

    if (!answer.ok) {
      if (answer.code === 'offline' || answer.code === 'not_signed_in') return;

      setPrep(previous);
      flash.problem(answer.message ?? say(CALLS_UI.prepFailed, lang));
    }
  }

  const warning =
    prep <= 15 ? PREP_WARNING.short : prep >= 60 ? PREP_WARNING.long : PREP_WARNING.fine;
  const loud = prep <= 15 || prep >= 60;

  return (
    <div
      data-split
      className="grid [grid-template-columns:minmax(0,1.5fr)_minmax(0,1fr)] items-start gap-[18px]"
    >
      <div className="grid gap-3">
        {CHANNEL_ROWS.map((row) => {
          const on = !off[row.key];

          /*
           * Today by door, from the same group-by the strip above reads. A lane
           * the server did not name has taken nothing, which is a zero rather
           * than a dash — the query answers every lane that has a row.
           *
           * Two of the four cells stay blank on a live console and neither is
           * an oversight. Commission is a contract term nobody has entered
           * here, and it was drawn as a flat 27% for Yandex. "Live now" is a
           * count of orders in flight per door, which nothing computes.
           */
          const today = stats.live ? (stats.channels[ROW_LANE[row.key] ?? ''] ?? null) : null;

          const cells = [
            {
              label: say(CALLS_COPY.cellToday, lang),
              value: stats.live
                ? `${today?.orders ?? 0} ${say(CALLS_COPY.orders, lang)}`
                : `${row.orders} ${say(CALLS_COPY.orders, lang)}`,
              tone: 'var(--fg)',
            },
            {
              label: say(CALLS_COPY.cellRevenue, lang),
              value: formatTiyinAmount(stats.live ? (today?.revenue ?? 0) : row.revenue, lang),
              tone: 'var(--fg)',
            },
            {
              label: say(CALLS_COPY.cellCommission, lang),
              value: stats.live
                ? DASH
                : row.fee > 0
                  ? `${row.fee}%`
                  : say(CALLS_COPY.commissionNone, lang),
              tone: stats.live || row.fee === 0 ? 'var(--success-600)' : 'var(--danger-600)',
            },
            {
              label: say(CALLS_COPY.cellLive, lang),
              value: stats.live || !on ? DASH : String(row.live),
              tone: 'var(--fg)',
            },
          ];

          return (
            <section key={row.key} className={`${CARD} overflow-hidden`}>
              <div className="border-divider flex items-center gap-3.5 border-b px-5 py-4">
                <span
                  className="font-display grid size-[34px] flex-none place-items-center rounded-[9px] text-xs font-extrabold"
                  style={{ background: row.tint, color: row.colour }}
                >
                  {row.initial}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[9px]">
                    <span className="text-md font-semibold">{say(row.name, lang)}</span>
                    <span
                      className={`rounded-pill text-2xs flex h-[22px] items-center gap-1.5 px-[9px] font-semibold ${
                        on ? 'bg-success-50 text-success-700' : 'bg-bg-muted text-fg-muted'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`size-1.5 rounded-full ${
                          on ? 'bg-success-500' : 'bg-[var(--n-400)]'
                        }`}
                      />
                      {say(on ? CALLS_COPY.channelConnected : CALLS_COPY.channelDisabled, lang)}
                    </span>
                  </div>
                  {/* The handle is the restaurant's own — a domain, a bot name,
                      a telephone number, a contract reference — and nothing
                      publishes it. Blank rather than the design's. */}
                  {stats.live ? null : (
                    <div className="text-fg-subtle mt-[3px] text-xs">{say(row.owner, lang)}</div>
                  )}
                </div>

                <Switch
                  on={on}
                  label={say(row.name, lang)}
                  onClick={() => void flip(row.key, say(row.name, lang), on)}
                />
              </div>

              <div className="bg-divider grid grid-cols-2 gap-px sm:grid-cols-4">
                {cells.map((cell) => (
                  <div key={cell.label} className="bg-surface px-4 py-[13px]">
                    <div className="text-2xs tracking-caps text-fg-subtle font-semibold uppercase">
                      {cell.label}
                    </div>
                    <div
                      data-num
                      className="mt-[5px] text-sm font-semibold"
                      style={{ color: cell.tone }}
                    >
                      {cell.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-bg-subtle border-divider flex flex-wrap items-center gap-[9px] border-t px-5 py-[13px]">
                <span className="text-2xs text-fg-subtle flex-none">
                  {say(CALLS_UI.route, lang)}
                </span>

                {row.route.map((step, index) => (
                  <span
                    key={say(step, lang)}
                    className={`flex items-center gap-2 text-xs ${
                      index === 0 ? 'text-fg font-semibold' : 'text-fg-muted font-medium'
                    }`}
                  >
                    {index > 0 ? (
                      <span aria-hidden className="text-fg-disabled font-normal">
                        →
                      </span>
                    ) : null}
                    {say(step, lang)}
                  </span>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="grid gap-3.5">
        {/* ------------------------------------------------------ the rules */}
        <section className={`${CARD} px-[22px] py-5`}>
          <h3 className={H3}>{say(CALLS_UI.rulesHead, lang)}</h3>
          <p className="text-fg-subtle mt-1.5 mb-4 text-xs leading-normal">
            {say(CALLS_UI.rulesSub, lang)}
          </p>

          <div className="grid gap-[13px]">
            {AUTOMATION_RULES.map((rule) => {
              const on = rules[rule.key] ?? rule.on;

              return (
                <div key={rule.key} className="flex items-start gap-3">
                  <RuleSwitch
                    on={on}
                    label={say(rule.label, lang)}
                    onClick={() => void flipRule(rule.key, say(rule.label, lang), on)}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{say(rule.label, lang)}</div>
                    <div className="text-fg-muted mt-0.5 text-xs leading-normal">
                      {say(rule.note, lang)}
                    </div>
                    {/*
                      Whether the server acts on this rule, or only records it.
                      A switch that stores an intention and a switch that closes
                      a door look identical and are not — the same line the door
                      switches beside them carry. Only shown on a live console:
                      the demo has no server to act on anything.
                    */}
                    {saved.live && saved.enforced[rule.key] !== true ? (
                      <div className="text-fg-subtle text-2xs mt-1 leading-normal">
                        {say(CALLS_UI.ruleNoted, lang)}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* --------------------------------------------------- the prep time */}
        <section className={`${CARD} px-[22px] py-5`}>
          <h3 className={H3}>{say(CALLS_UI.prepHead, lang)}</h3>
          <p className="text-fg-subtle mt-1.5 mb-3.5 text-xs leading-normal">
            {say(CALLS_UI.prepSub, lang)}
          </p>

          <div data-num className="font-display text-4xl leading-none font-bold tracking-tight">
            {prep}
          </div>
          <div className="text-fg-subtle mt-1 text-xs">{say(CALLS_UI.prepUnit, lang)}</div>

          <div className="mt-4 flex gap-2">
            {PREP_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                data-press
                onClick={() => void choosePrep(option)}
                className={`h-[38px] flex-1 rounded-md border text-sm font-semibold ${
                  prep === option
                    ? 'bg-brand-500 border-brand-500 text-white'
                    : 'bg-surface text-fg'
                }`}
              >
                {option} {say(CALLS_COPY.minutesShort, lang)}
              </button>
            ))}
          </div>

          {/*
           * The sentence changes with the number, and only two of the three
           * get the amber ground. A warning that is always on is wallpaper.
           */}
          <div
            className={`mt-4 rounded-md border px-[15px] py-[13px] text-xs leading-normal font-medium ${
              loud
                ? 'bg-warning-50 text-warning-700 border-[rgba(247,144,9,.26)]'
                : 'bg-bg-subtle text-fg-muted'
            }`}
          >
            {say(warning, lang)}
          </div>
        </section>

        {/* -------------------------------------------------- the commission */}
        <section className={`${CARD} px-[22px] py-5`}>
          <h3 className={H3}>{say(CALLS_UI.commissionHead, lang)}</h3>
          <p className="text-fg-subtle mt-1.5 mb-[15px] text-xs leading-normal">
            {say(CALLS_UI.commissionSub, lang)}
          </p>

          <div className="grid gap-[11px]">
            {CHANNEL_ROWS.map((row) => (
              <div key={row.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium">
                    {say(row.name, lang)}
                  </span>
                  <span data-num className="flex-none text-sm font-semibold">
                    {formatTiyinAmount(afterCommission(row), lang)}
                  </span>
                </div>

                <div className="mt-[5px] flex items-center gap-[9px]">
                  <div
                    data-rail
                    className="bg-bg-muted h-[5px] flex-1 overflow-hidden rounded-full"
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${row.netPercent}%`,
                        background: row.fee > 0 ? 'var(--warning-500)' : 'var(--success-500)',
                      }}
                    />
                  </div>
                  <span data-num className="text-2xs text-fg-subtle w-[66px] flex-none text-right">
                    {row.fee > 0 ? `−${row.fee}%` : '0%'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="border-divider text-fg-muted mt-4 border-t pt-3.5 text-xs leading-normal">
            {say(CALLS_UI.commissionNote, lang)}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ============================================================== the screen */

const TABS = [
  { key: 'queue', label: CALLS_UI.tabQueue },
  { key: 'compose', label: CALLS_UI.tabCompose },
  { key: 'delivery', label: CALLS_UI.tabDelivery },
  { key: 'agg', label: CALLS_UI.tabAggregators },
  { key: 'chan', label: CALLS_UI.tabChannels },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/**
 * Head, four figures, the strip, and whichever tab is open.
 *
 * The shared `<Tabs>` in `(dashboard)/tabs.tsx` draws the same segmented
 * control and is used by nine other screens — this one cannot borrow it for two
 * reasons the design makes explicit. The head carries a live-status pill beside
 * the button (`t.cLine`, `:3880`), which `<Tabs>` has no slot for; and the
 * button itself is `cNew` at `:10919`, which *switches the strip to compose*
 * rather than navigating. The strip's classes below are copied from `<Tabs>`
 * verbatim so the two do not drift into two controls.
 */
export function CallsScreen({
  lang,
  title,
  subtitle,
  delivery,
  queue,
  menu,
  stats,
  rules,
}: {
  lang: Lang;
  title: string;
  subtitle: string;
  /*
   * Resolved on the server, in `page.tsx`. The screen is a client island — every
   * tab is stateful in the design itself — so the one tab with a real endpoint
   * behind it is handed its data rather than fetching it: a `use client` file
   * cannot read the session cookie, and a second fetch from the browser would
   * ask Laravel for the same board with no bearer on it.
   */
  delivery: DeliveryBoard;
  /** The orders waiting for an answer — `calls-server.ts`, same reasoning. */
  queue: IntakeQueue;
  /** The compose flow's eight tiles, from the catalogue where there is one. */
  menu: ComposeMenu;
  /** The figures above the strip — `getIntakeStats()`, same reasoning. */
  stats: IntakeStats;
  /** The desk's own four switches and its prep time — `getIntakeRules()`. */
  rules: IntakeRules;
}) {
  const [tab, setTab] = useState<TabKey>('queue');

  /*
   * Three cards on a live desk, four on the design's own.
   *
   * All four used to be literals — `84`, `0:38`, a `som(168_000)` constant and
   * `3` — each under a delta chip out of the drawing. The one role whose entire
   * job is the list below them opened on four fabricated scores. Three are
   * answerable off the operator dashboard; the fourth, time to answer, needs a
   * telephony log that does not exist, so the card is gone rather than filled.
   *
   * A delta only where the server measured one: `delta_percent` is populated
   * for `orders` and for nothing else on that arm.
   */
  const kpis = stats.live
    ? [
        {
          ...INTAKE_KPIS[0]!,
          value: stats.taken === null ? DASH : String(stats.taken),
          delta: stats.takenDeltaPercent === null ? null : signedPercent(stats.takenDeltaPercent),
          tone: (stats.takenDeltaPercent ?? 0) >= 0 ? ('success' as const) : ('muted' as const),
        },
        {
          ...INTAKE_KPIS[2]!,
          value: stats.averageOrder === null ? DASH : formatTiyinAmount(stats.averageOrder, lang),
          delta: null,
          tone: 'muted' as const,
        },
        {
          ...INTAKE_KPIS[3]!,
          value: stats.declined === null ? DASH : String(stats.declined),
          delta: null,
          tone: 'muted' as const,
        },
      ]
    : [
        { ...INTAKE_KPIS[0]!, value: '84' },
        { ...INTAKE_KPIS[1]!, value: '0:38' },
        { ...INTAKE_KPIS[2]!, value: formatTiyinAmount(INTAKE_AVERAGE, lang) },
        { ...INTAKE_KPIS[3]!, value: '3' },
      ];

  return (
    <>
      <div data-pagehead className="mb-[18px] flex items-end justify-between gap-6">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="text-fg-muted mt-1.5 text-sm">{subtitle}</p>
        </div>

        <div className="flex flex-none items-center gap-2.5">
          <span className="rounded-pill bg-success-50 text-success-700 flex h-8 items-center gap-[7px] px-3 text-xs font-semibold">
            <span data-live="true" aria-hidden className="bg-success-500 size-1.5 rounded-full" />
            {say(CALLS_UI.lineOpen, lang)}
          </span>

          <button
            type="button"
            data-press
            onClick={() => setTab('compose')}
            className="bg-brand-500 hover:bg-brand-600 h-9 rounded-md px-[15px] text-sm font-semibold whitespace-nowrap text-white"
          >
            {say(CALLS_UI.newOrder, lang)}
          </button>
        </div>
      </div>

      <div className="mb-5 grid [grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr))] gap-3">
        {kpis.map((kpi) => (
          <div key={say(kpi.label, lang)} className={`${CARD} px-[18px] py-4`}>
            <div className="text-fg-subtle text-xs font-medium">{say(kpi.label, lang)}</div>
            <div data-num className="font-display mt-1.5 text-3xl font-bold tracking-tight">
              {kpi.value}
            </div>
            {kpi.delta === null ? null : (
              <div
                className={`mt-1 text-xs font-medium ${
                  kpi.tone === 'success' ? 'text-success-600' : 'text-fg-subtle'
                }`}
              >
                {say(kpi.delta, lang)}
              </div>
            )}
          </div>
        ))}
      </div>

      <div
        role="tablist"
        aria-label={title}
        className="bg-bg-muted mb-5 flex w-fit max-w-full gap-[3px] overflow-x-auto rounded-[11px] p-[3px]"
      >
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            data-seg
            data-active={tab === entry.key ? 'true' : undefined}
            aria-selected={tab === entry.key}
            aria-controls={`panel-${entry.key}`}
            onClick={() => setTab(entry.key)}
            className="text-fg-muted h-8 rounded-lg border-0 bg-transparent px-[15px] text-sm font-semibold whitespace-nowrap"
          >
            {say(entry.label, lang)}
          </button>
        ))}
      </div>

      <div
        id="panel-queue"
        role="tabpanel"
        hidden={tab !== 'queue'}
        data-panel-in={tab === 'queue' ? '' : undefined}
      >
        <QueuePanel lang={lang} queue={queue} />
      </div>
      <div
        id="panel-compose"
        role="tabpanel"
        hidden={tab !== 'compose'}
        data-panel-in={tab === 'compose' ? '' : undefined}
      >
        <ComposePanel lang={lang} menu={menu.items} live={menu.live} />
      </div>
      <div
        id="panel-delivery"
        role="tabpanel"
        hidden={tab !== 'delivery'}
        data-panel-in={tab === 'delivery' ? '' : undefined}
      >
        <DeliveryPanel
          lang={lang}
          couriers={delivery.couriers}
          toAssign={delivery.toAssign}
          orderIds={delivery.orderIds}
          assignTo={delivery.assignTo}
          riders={delivery.riders}
        />
      </div>
      <div
        id="panel-agg"
        role="tabpanel"
        hidden={tab !== 'agg'}
        data-panel-in={tab === 'agg' ? '' : undefined}
      >
        <AggregatorsPanel lang={lang} />
      </div>
      <div
        id="panel-chan"
        role="tabpanel"
        hidden={tab !== 'chan'}
        data-panel-in={tab === 'chan' ? '' : undefined}
      >
        <ChannelsPanel lang={lang} stats={stats} rules={rules} />
      </div>
    </>
  );
}
