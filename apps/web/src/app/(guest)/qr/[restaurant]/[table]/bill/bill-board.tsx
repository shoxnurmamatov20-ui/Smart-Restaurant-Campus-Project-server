'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { flash } from '@restaurant/ui';

import {
  billTotals,
  cashRoundingDelta,
  percentOf,
  roundedForCash,
  splitEvenly,
  SERVICE_PERCENT,
  VAT_PERCENT,
} from '@restaurant/surfaces/money';

import type { GuestCopy } from '@restaurant/surfaces/guest/copy';
import { translate, type GuestLocale } from '@restaurant/surfaces/guest/menu-data';
import { fill, som } from '../../../../guest-session';
import {
  CARD_SCHEMES,
  GOLD_CARD_PERCENT,
  lineTotal,
  orderSubtotal,
  SPLIT_RANGE,
  TABLE_ORDER,
  TABLE_RAILS,
  TABLE_TIPS,
  type TableOrder,
} from '@restaurant/surfaces/guest/table-data';

/**
 * The bill.
 *
 * Dine-in, so this is the one guest screen that carries a service charge —
 * `chargesService()` decides that, not this file, which is why the channel is
 * passed rather than the percentage. Everything else follows `BillTotals::of()`
 * in the order the server applies it: discount off the food, service on what is
 * left, VAT read out of the sum rather than added to it.
 *
 * Three things sit outside that total and each for its own reason:
 *
 *   · the **tip**, which belongs to the waiter and never enters revenue;
 *   · the **cash rounding**, which exists only on the cash rail and is shown as
 *     its own line — a guest handed a figure 400 so'm off the one they just read
 *     is owed the sentence explaining it;
 *   · the **split**, which divides what is owed without changing it. Each share
 *     floors to a whole 1 000 so'm and the remainder lands on the first cheque,
 *     stated on screen, because shares that do not add up to the bill is the
 *     one arithmetic a table will actually check.
 */
export function BillBoard({
  locale,
  copy,
  here,
  order: live = null,
  payHref,
}: {
  locale: GuestLocale;
  copy: GuestCopy;
  here: string;
  /**
   * The table's actual bill, when the API answered with one.
   *
   * `null` covers both "this table has nothing open" and "the API did not
   * answer" — the page tells them apart and this screen does not need to: a
   * bill screen with no bill draws the fixture and says `Namoyish rejimi`
   * underneath, which is what it has always done.
   */
  order?: TableOrder | null;
  /** Where "ask for the bill" goes — `/qr/{r}/{token}/service/pay`. */
  payHref?: string;
}) {
  const t = copy.qr.bill;
  const router = useRouter();

  const [gold, setGold] = useState(true);
  const [tipPercent, setTipPercent] = useState(10);
  const [railId, setRailId] = useState(TABLE_RAILS[0]!.id);
  /*
   * How many ways, and whether the sheet is open — two pieces of state, not one.
   *
   * The split used to be a permanently open section between the tip and the pay
   * button, so a guest paying the whole bill scrolled past a stepper offering
   * to divide it. The design puts it behind a button (`splitOpen`), which is
   * also what makes "4" a sensible starting number: it is only ever seen by
   * somebody who has already said they want to split.
   */
  const [ways, setWays] = useState<number>(SPLIT_RANGE.start);
  const [splitOpen, setSplitOpen] = useState(false);

  const [asking, setAsking] = useState(false);

  const order = live ?? TABLE_ORDER;
  const rail = TABLE_RAILS.find((option) => option.id === railId) ?? TABLE_RAILS[0]!;

  const subtotal = orderSubtotal(order);

  const bill = billTotals({
    subtotal,
    channel: 'dine_in',
    discount: gold ? percentOf(subtotal, GOLD_CARD_PERCENT) : 0,
  });

  // The waiter's, on the food after the discount — not on the service charge,
  // which is already the restaurant's own line for the same work.
  const tip = percentOf(bill.subtotal - bill.discount, tipPercent);

  const payable = bill.total + tip;
  const rounding = rail.isCash ? cashRoundingDelta(payable) : 0;
  const charged = rail.isCash ? roundedForCash(payable) : payable;

  const split = splitOpen && ways > 1 ? splitEvenly(charged, ways) : null;

  return (
    <main data-safe-top className="flex flex-1 flex-col px-[var(--guest-gutter)] pb-8">
      <header className="pt-2">
        <Link
          href={`${here}/status?lang=${locale}`}
          className="text-fg-muted text-sm font-semibold"
        >
          ← {copy.qr.dish.back}
        </Link>

        <h1 className="font-display mt-2 text-3xl leading-tight font-semibold tracking-tight">
          {t.title}
        </h1>

        <p data-num className="text-fg-subtle mt-1 text-sm">
          {fill(t.table, { table: order.table, guests: order.guests })}
        </p>
      </header>

      {/* ----------------------------------------------------------- lines */}
      <ul className="mt-5 flex flex-col">
        {order.lines.map((line) => (
          <li
            key={line.id}
            className="border-divider flex items-baseline gap-3 border-b py-2.5 last:border-0"
          >
            <span data-num className="text-fg-subtle w-6 flex-none text-xs font-semibold">
              {line.quantity}×
            </span>
            <span className="min-w-0 flex-1 text-sm">
              {translate(line.name, locale)}
              {/*
               * What was asked for on this line — the options and the kitchen
               * note. `PublicTableController` has sent both all along and the
               * mapper dropped them, so a guest who asked for no onions could
               * not check their own bill against their own request.
               */}
              {line.options.length === 0 && line.note === '' ? null : (
                <span className="text-fg-subtle mt-0.5 block text-xs leading-normal">
                  {[...line.options, line.note].filter((part) => part !== '').join(' · ')}
                </span>
              )}
            </span>
            <span data-num className="flex-none text-sm font-semibold">
              {som(lineTotal(line), locale)}
            </span>
          </li>
        ))}
      </ul>

      {/* --------------------------------------------------------- totals */}
      <dl className="mt-4 flex flex-col gap-2 text-sm">
        <Row label={t.items} value={som(bill.subtotal, locale)} />

        {/*
         * The gold card, as a switch rather than a fact.
         *
         * A guest paying for a table of colleagues frequently does not want to
         * spend their own discount on it, and a discount that cannot be declined
         * is one they have to ask a waiter to reverse at the till.
         */}
        <div className="flex items-center justify-between gap-3">
          <label className="flex flex-1 items-center gap-2">
            <input
              type="checkbox"
              checked={gold}
              onChange={(event) => {
                setGold(event.target.checked);
                /*
                 * The design flashes both directions — `Mehmon.dc.html:1035`.
                 * A discount switching itself off silently on a bill is the one
                 * change a table will notice at the wrong moment.
                 */
                flash(
                  event.target.checked
                    ? fill(copy.qr.common.loyaltyOn, { percent: GOLD_CARD_PERCENT })
                    : copy.qr.common.loyaltyOff,
                );
              }}
              className="accent-acc h-4 w-4 flex-none"
            />
            <span className="text-fg-subtle">
              {fill(t.discount, { percent: GOLD_CARD_PERCENT })}
            </span>
          </label>

          <span data-num className={`font-semibold ${gold ? 'text-acc' : 'text-fg-subtle'}`}>
            {gold ? `−${som(bill.discount, locale)}` : '—'}
          </span>
        </div>

        <Row
          label={fill(t.service, { percent: SERVICE_PERCENT })}
          value={som(bill.serviceCharge, locale)}
        />

        {tip > 0 ? <Row label={`${t.tip} · ${t.tipNote}`} value={som(tip, locale)} /> : null}

        {rounding !== 0 ? (
          <Row
            label={fill(t.cashRounded, { amount: som(charged, locale) })}
            value={`${rounding > 0 ? '+' : '−'}${som(Math.abs(rounding), locale)}`}
          />
        ) : null}

        <div className="border-divider mt-1 flex items-baseline justify-between border-t pt-3">
          <dt className="text-md font-semibold">{t.total}</dt>
          <dd data-num className="font-display text-2xl font-semibold">
            {som(charged, locale)}
          </dd>
        </div>

        <p className="text-fg-subtle text-xs">
          {fill(t.vat, { percent: VAT_PERCENT })} {som(bill.vatIncluded, locale)}
        </p>
      </dl>

      {/* ------------------------------------------------------------ tip */}
      <section className="mt-5">
        <h2 className="text-fg-subtle text-xs font-semibold tracking-wide uppercase">{t.tip}</h2>

        <div role="radiogroup" aria-label={t.tip} className="mt-2 flex gap-1.5">
          {TABLE_TIPS.map((step) => (
            <button
              key={step}
              type="button"
              role="radio"
              aria-checked={step === tipPercent}
              onClick={() => {
                setTipPercent(step);
                if (step === 0) flash(t.noTip);
              }}
              className={`h-[var(--tap-min)] flex-1 rounded-full text-sm font-semibold ${
                step === tipPercent ? 'bg-acc text-white' : 'bg-bg-muted text-fg-muted'
              }`}
            >
              {step === 0 ? t.tipNone : `${step}%`}
            </button>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- rail */}
      <section className="mt-5">
        <h2 className="text-fg-subtle text-xs font-semibold tracking-wide uppercase">{t.howPay}</h2>

        {/*
         * A name and a line about it — `Mehmon.dc.html:876-881`.
         *
         * Four bare labels made `Click` and `Payme` read as two spellings of
         * one thing, and gave the cash row no way to say the part that matters:
         * choosing it fetches a waiter rather than settling anything.
         */}
        <div role="radiogroup" aria-label={t.howPay} className="mt-2 grid gap-2">
          {TABLE_RAILS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={option.id === railId}
              onClick={() => setRailId(option.id)}
              className={`flex items-center gap-3 rounded-md border px-4 py-3 text-left ${
                option.id === railId ? 'border-acc bg-acc-soft' : 'border-border bg-surface'
              }`}
            >
              <span
                aria-hidden
                className={`grid size-5 flex-none place-items-center rounded-full border-[1.8px] ${
                  option.id === railId ? 'border-acc' : 'border-border-strong'
                }`}
              >
                {option.id === railId ? <span className="bg-acc size-2.5 rounded-full" /> : null}
              </span>

              <span className="min-w-0 flex-1">
                <span className="text-md block leading-snug font-semibold">{option.label}</span>
                <span className="text-fg-subtle mt-px block text-xs">
                  {option.sub === 'schemes'
                    ? CARD_SCHEMES
                    : option.sub === 'app'
                      ? t.railApp
                      : t.railWaiter}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- split */}
      <section className="mt-5">
        <button
          type="button"
          aria-expanded={splitOpen}
          onClick={() => setSplitOpen((open) => !open)}
          className={`h-11 w-full rounded-md border text-sm font-semibold ${
            splitOpen ? 'border-border-strong bg-bg-muted' : 'border-border text-fg-muted'
          }`}
        >
          {splitOpen ? t.close : t.split}
        </button>

        {splitOpen ? (
          <div className="border-border bg-surface mt-2.5 rounded-lg border px-4 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-md font-semibold">{t.split}</h2>
              <button
                type="button"
                onClick={() => setSplitOpen(false)}
                className="text-brand-600 text-sm font-semibold"
              >
                {t.close}
              </button>
            </div>

            <p className="text-fg-muted mt-1.5 text-sm leading-normal">{t.splitSub}</p>

            <div className="mt-3.5 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setWays((current) => Math.max(SPLIT_RANGE.min, current - 1))}
                aria-label="−"
                /* Dimmed at the floor rather than removed: a control that
                   vanishes at two makes the row jump under the thumb. */
                className={`border-border grid size-9 place-items-center rounded-[10px] border text-lg font-semibold ${
                  ways > SPLIT_RANGE.min ? 'text-fg' : 'text-fg-disabled'
                }`}
              >
                −
              </button>

              <div className="w-16 text-center">
                <div data-num className="font-display text-[22px] font-bold">
                  {ways}
                </div>
                <div className="text-fg-subtle text-2xs mt-px">{t.splitWays}</div>
              </div>

              <button
                type="button"
                onClick={() => setWays((current) => Math.min(SPLIT_RANGE.max, current + 1))}
                aria-label="+"
                className="border-border grid size-9 place-items-center rounded-[10px] border text-lg font-semibold"
              >
                +
              </button>
            </div>

            {split !== null ? (
              <div className="border-divider mt-3.5 border-t pt-3">
                <p className="flex items-baseline justify-between text-sm">
                  <span className="text-fg-subtle">{t.splitEach}</span>
                  <span data-num className="font-semibold">
                    {som(split.each, locale)}
                  </span>
                </p>

                {/*
                 * The first cheque, shown only when it actually differs. Drawing
                 * an identical "first share" row under an even split invites a
                 * table to hunt for a difference that is not there.
                 */}
                {split.first !== split.each ? (
                  <p className="mt-1 flex items-baseline justify-between text-sm">
                    <span className="text-fg-subtle">{t.splitFirst}</span>
                    <span data-num className="font-semibold">
                      {som(split.first, locale)}
                    </span>
                  </p>
                ) : null}

                <p className="text-fg-subtle mt-1.5 text-xs leading-normal">{t.splitNote}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ------------------------------------------------------------ pay */}
      <button
        type="button"
        disabled={asking}
        onClick={() => {
          /*
           * What was paid travels in the URL, not in state.
           *
           * The rating screen prints a receipt line — amount, rail — and client
           * state does not survive the navigation that gets there. A query
           * string does, and it survives a reload too, which matters on the one
           * screen a guest is most likely to leave open on a table.
           */
          const paid = split === null ? charged : split.first;

          /*
           * The half that is real: a waiter is asked for, and the bill moves to
           * `topay`. Money is still not moved — the toast under the button says
           * so, and it has to keep saying so, because a guest who pressed this
           * and navigated must not be left believing a card was charged.
           *
           * Fire-and-navigate rather than await-and-navigate. The guest has
           * finished with this screen; making them watch a spinner so the app
           * can confirm what it already told them is the wrong trade, and the
           * request is idempotent per table — the API answers 200 with
           * `already_open` rather than raising a second call.
           */
          if (payHref !== undefined) {
            setAsking(true);

            void fetch(payHref, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                method: rail.isCash ? 'cash' : rail.sub === 'app' ? 'online' : 'card',
                tip_percent: TABLE_TIPS.includes(tipPercent) ? tipPercent : undefined,
                split_between: split === null ? undefined : ways,
              }),
            }).catch(() => {
              // Silent: the guest is already on the next screen, and a waiter
              // walks past a table that has finished eating in any case.
            });
          }

          flash(copy.qr.common.demoPayment);
          router.push(`${here}/rating?lang=${locale}&paid=${paid}&rail=${rail.id}`);
        }}
        className="bg-acc mt-6 grid h-[52px] w-full place-items-center rounded-md text-base font-semibold text-white disabled:opacity-55"
      >
        {t.pay} {som(split === null ? charged : split.first, locale)}
      </button>

      <p className="text-fg-subtle mt-2 text-xs leading-normal">{copy.qr.common.demoPayment}</p>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-fg-subtle">{label}</dt>
      <dd data-num className="font-semibold">
        {value}
      </dd>
    </div>
  );
}
