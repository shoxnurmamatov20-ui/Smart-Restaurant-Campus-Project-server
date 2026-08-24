'use client';

import { useState } from 'react';
import { flash } from '@restaurant/ui';
import { formatTiyinAmount } from '@restaurant/utils';

import { copy, FLASH, SHARED } from '@restaurant/surfaces/crew/copy';
import type { Lang } from '@restaurant/surfaces/crew/data';
import { realId, type PricedShelfRow, type RiderDrop } from '@restaurant/surfaces/crew/live';
import { moreCopy } from '@restaurant/surfaces/crew/more-copy';
import {
  HANDBACK_REASON_CODES,
  MORE_PURCHASE,
  MORE_SWAP_PEOPLE,
  MORE_SWAP_SHIFTS,
  MORE_WASTE_ITEMS,
  WASTE_REASON_CODES,
} from '@restaurant/surfaces/crew/more-data';
import type { SupplierChoice, SwapOptions } from '@restaurant/surfaces/crew/live';
import { drain, enqueue } from '../crew-queue';
import { Note } from './more-screens';

/**
 * The four More screens that take input — `dc.html:614-675, 936-1000`.
 *
 * Record waste, order from a supplier, hand the bag back, and swap a shift.
 * Client components because each holds a small amount of state and the design
 * gives each a live total that has to move with a stepper: a screen that made a
 * storekeeper add up five lines in their head before pressing Save would be
 * saving a number nobody checked.
 *
 * ---------------------------------------------------------------------------
 * All four write now, and each one waited on the same missing thing: an id
 *
 * They were composed exactly as they would be sent and sent nothing, because
 * every payload names a row by number and every list here was a design file:
 * `w1`…`w5` against `ingredient_id`, `p1`…`p5` against a purchase order,
 * "Payshanba" against `shift_id`, a *reason* against `order_id`. Four reads
 * closed that — `pricedShelf()`, `crewSuppliers()`, `swapOptions()` and
 * `riderRound()` in `crew-server.ts` — and the four forms now take their rows
 * as props from the server component above them.
 *
 * **A fixture screen still sends nothing, and still says so.** That is not a
 * leftover: an id that does not exist would be refused upstream and the person
 * would be told their work did not land, when in truth it was never theirs to
 * send. `live` is the switch, and it is the same switch every other panel in
 * this app uses.
 *
 * **Two of the four queue and two do not**, and the split is deliberate. Waste
 * and a hand-back are things that already happened in a place with no signal —
 * a walk-in fridge, a stairwell — so they go through `POST /staff/actions`,
 * which keys on `local_id` and cannot write them twice. A purchase order and a
 * swap request are asks addressed to a person; raised twice they are two
 * documents in somebody's queue with no natural key to collapse them, so both
 * want a network and say so when there is none.
 */
function useTiyin(lang: Lang) {
  return (tiyin: number) => formatTiyinAmount(tiyin, lang);
}

function Stepper({
  value,
  onStep,
  label,
}: {
  value: number;
  onStep: (step: number) => void;
  label: string;
}) {
  return (
    <span className="flex flex-none items-center gap-2">
      <button
        type="button"
        onClick={() => onStep(-1)}
        aria-label={`− ${label}`}
        className="border-border-strong bg-surface grid size-[34px] place-items-center rounded-[10px] border text-base font-semibold"
      >
        −
      </button>
      <span data-num className="font-display text-md w-[38px] text-center font-bold">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onStep(1)}
        aria-label={`+ ${label}`}
        className="border-border-strong bg-surface grid size-[34px] place-items-center rounded-[10px] border text-base font-semibold"
      >
        +
      </button>
    </span>
  );
}

function Confirmed({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="bg-success-50 text-success-700 mt-3.5 rounded-md px-3.5 py-3 text-sm font-semibold"
    >
      {children}
    </p>
  );
}

/**
 * The one sentence that decides how somebody reads everything under it.
 *
 * `queued` promises the work will leave the phone; `notWired` promises it will
 * not. Putting the wrong one up is worse than putting up neither — it is the
 * difference between walking to a tablet and doing the job again, and going
 * home.
 */
function Wire({ lang, live }: { lang: Lang; live: boolean }) {
  const shared = copy(SHARED, lang);

  return (
    <p
      className={`text-2xs mb-3.5 rounded-[10px] px-3 py-2.5 leading-normal ${
        live ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700'
      }`}
    >
      {live ? shared.queued : shared.notWired}
    </p>
  );
}

/** An honest empty answer — the server replied, and the answer was none. */
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-fg-subtle py-9 text-center text-[13px]">{children}</p>;
}

/* ------------------------------------------------------------------ waste */

export function WasteScreen({
  lang,
  rows = [],
  live = false,
}: {
  lang: Lang;
  /** The shelf, priced — `pricedShelf()`. Empty on a console with no session. */
  rows?: readonly PricedShelfRow[];
  live?: boolean;
}) {
  const t = moreCopy(lang);
  const f = copy(FLASH, lang);
  const shared = copy(SHARED, lang);
  const money = useTiyin(lang);

  const [reason, setReason] = useState(0);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState<string | null>(null);

  /*
   * One list, drawn from whichever source there is.
   *
   * The fixture's names come from the copy catalogue and are index-aligned with
   * `MORE_WASTE_ITEMS`; a live row carries its own name, already resolved for
   * this reader by the API. Normalising both into the same three fields here
   * keeps the rest of the screen from asking which mode it is in.
   */
  const lines = live
    ? rows.map((row) => ({ id: row.id, name: row.name[lang], unitTiyin: row.unitTiyin }))
    : MORE_WASTE_ITEMS.map((item, index) => ({
        id: item.id,
        name: t.wasteItems[index] ?? '',
        unitTiyin: item.unitTiyin,
      }));

  const total = lines.reduce((sum, item) => sum + (quantities[item.id] ?? 0) * item.unitTiyin, 0);

  return (
    <section>
      <Wire lang={lang} live={live} />

      {/* Why it was thrown away, before what. The reason is what a food-cost
          report is grouped by, and it is the field that gets left blank when it
          is asked for last. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {t.wasteReasons.map((label, index) => (
          <button
            key={label}
            type="button"
            aria-pressed={reason === index}
            onClick={() => setReason(index)}
            className={`rounded-pill h-8.5 border px-3.5 text-xs font-semibold ${
              reason === index
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-border bg-surface text-fg-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {lines.length === 0 ? (
        <Empty>{shared.emptyShelf}</Empty>
      ) : (
        <ul>
          {lines.map((item) => {
            const quantity = quantities[item.id] ?? 0;

            return (
              <li
                key={item.id}
                className="border-divider flex items-center gap-3 border-b py-3 last:border-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.name}</span>
                  <span data-num className="text-fg-subtle text-2xs mt-px block">
                    {money(item.unitTiyin)}
                  </span>
                </span>

                <Stepper
                  value={quantity}
                  label={item.name}
                  onStep={(step) =>
                    setQuantities((current) => ({
                      ...current,
                      [item.id]: Math.max(0, (current[item.id] ?? 0) + step),
                    }))
                  }
                />
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-border mt-4 flex items-baseline justify-between border-t pt-3.5">
        <span className="text-fg-muted text-sm">{t.text.wasteTotal}</span>
        <span data-num className="font-display text-danger-600 text-xl font-bold">
          {money(total)}
        </span>
      </div>

      {/*
       * Enabled at zero and refusing, which is the design's own behaviour.
       *
       * A dimmed Save leaves a storekeeper who entered nothing wondering
       * whether the screen is broken or the entry did not take; a press that
       * says "enter a quantity first" answers it. `flash.problem` drops the
       * check and holds longer, which is the only difference the design draws
       * between a confirmation and a refusal.
       */}
      <button
        type="button"
        data-press
        onClick={() => {
          if (total === 0) {
            flash.problem(f.needsQuantity);

            return;
          }

          setSaved(`${t.wasteReasons[reason]} · ${money(total)}`);

          if (!live) {
            /* `MORE_WASTE_ITEMS` carries `w1`…`w5` and `waste_log` is keyed on
               `ingredient_id`. See `FLASH.notRecorded`. */
            flash.problem(f.notRecorded);

            return;
          }

          /*
           * One entry per line, not one document — the same argument the count
           * sheet makes. A storekeeper standing in a walk-in fridge is the
           * person most likely to have no signal, and a phone that dies at row
           * four must have recorded the three that were counted.
           *
           * The reason travels as a stable code rather than as the label on
           * screen: a food-cost report groups by it, and a reason written in
           * whatever language the phone was in would split one bucket into
           * three.
           */
          const code = WASTE_REASON_CODES[reason] ?? 'other';

          for (const item of lines) {
            const quantity = quantities[item.id] ?? 0;
            const ingredientId = realId(item.id);

            if (ingredientId === null || quantity <= 0) continue;

            enqueue(t.text.wasteSave, item.name, {
              kind: 'waste_log',
              payload: { ingredient_id: ingredientId, quantity, reason: code },
            });
          }

          void drain();
          flash(f.wasteRecorded);
        }}
        className={`mt-3.5 grid h-12 w-full place-items-center rounded-md text-sm font-semibold ${
          total === 0 ? 'bg-bg-muted text-fg-subtle' : 'bg-brand-500 text-white'
        }`}
      >
        {t.text.wasteSave}
      </button>

      {saved === null ? null : <Confirmed>{saved}</Confirmed>}

      <Note>{t.text.wasteNote}</Note>
    </section>
  );
}

/* --------------------------------------------------------------- reorder */

export function PurchaseScreen({
  lang,
  rows = [],
  suppliers = [],
  live = false,
}: {
  lang: Lang;
  /** The shelf, priced and with a suggested quantity — `pricedShelf()`. */
  rows?: readonly PricedShelfRow[];
  /** Who the order can be addressed to — `crewSuppliers()`. */
  suppliers?: readonly SupplierChoice[];
  live?: boolean;
}) {
  const t = moreCopy(lang);
  const f = copy(FLASH, lang);
  const shared = copy(SHARED, lang);
  const money = useTiyin(lang);

  /*
   * Only the rows that are actually short.
   *
   * A live shelf is a hundred ingredients and the design's sheet is five. What
   * makes five the right number is not the design, it is that a reorder screen
   * is opened to fix a shortage: listing everything the restaurant stocks turns
   * a thirty-second job into a scroll, and the rows that matter are the ones
   * below the minimum.
   */
  const lines = live
    ? rows
        .filter((row) => row.suggested > 0)
        .map((row) => ({
          id: row.id,
          name: row.name[lang],
          meta: row.onHand,
          unit: row.unit.en,
          unitTiyin: row.unitTiyin,
          suggested: row.suggested,
        }))
    : MORE_PURCHASE.map((item, index) => ({
        id: item.id,
        name: t.purchase[index]?.name ?? '',
        meta: t.purchase[index]?.meta ?? '',
        unit: '',
        unitTiyin: item.unitTiyin,
        suggested: item.suggested,
      }));

  /* Opens on the suggested quantities, which is the design's own default and
     the reason the screen is quick: a storekeeper adjusts two lines, not five. */
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(lines.map((item) => [item.id, item.suggested])),
  );
  const [supplier, setSupplier] = useState<string | null>(suppliers[0]?.id ?? null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const total = lines.reduce((sum, item) => sum + (quantities[item.id] ?? 0) * item.unitTiyin, 0);

  async function send() {
    setSending(true);

    try {
      const response = await fetch('/crew/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: Number(supplier),
          lines: lines
            .filter((item) => (quantities[item.id] ?? 0) > 0)
            .map((item) => ({
              ingredientId: realId(item.id),
              name: item.name,
              unit: item.unit,
              quantity: quantities[item.id] ?? 0,
            })),
        }),
      });

      if (!response.ok) {
        flash.problem(shared.sendFailed);

        return;
      }

      setSent(money(total));
      flash(f.purchaseRaised);
    } catch {
      // A phone at a service entrance with no signal. Said plainly rather than
      // queued: a purchase order raised twice is stock ordered twice.
      flash.problem(shared.sendFailed);
    } finally {
      setSending(false);
    }
  }

  return (
    <section>
      <Wire lang={lang} live={live} />

      {live && suppliers.length > 0 ? (
        <div className="mb-4">
          <p className="text-fg-subtle text-2xs tracking-caps mb-2 font-semibold uppercase">
            {t.text.porderSupplier}
          </p>
          <div className="flex flex-wrap gap-2">
            {suppliers.map((row) => (
              <button
                key={row.id}
                type="button"
                aria-pressed={supplier === row.id}
                onClick={() => setSupplier(row.id)}
                className={`rounded-pill h-8.5 border px-3.5 text-xs font-semibold ${
                  supplier === row.id
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-border bg-surface text-fg-muted'
                }`}
              >
                {row.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {lines.length === 0 ? (
        <Empty>{shared.emptyShelf}</Empty>
      ) : (
        <ul>
          {lines.map((item) => (
            <li
              key={item.id}
              className="border-divider flex items-center gap-3 border-b py-3 last:border-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{item.name}</span>
                <span data-num className="text-fg-subtle text-2xs mt-px block">
                  {item.meta}
                </span>
              </span>

              <Stepper
                value={quantities[item.id] ?? 0}
                label={item.name}
                onStep={(step) =>
                  setQuantities((current) => ({
                    ...current,
                    [item.id]: Math.max(0, (current[item.id] ?? 0) + step),
                  }))
                }
              />
            </li>
          ))}
        </ul>
      )}

      <div className="border-border mt-4 flex items-baseline justify-between border-t pt-3.5">
        <span className="text-fg-muted text-sm">{t.text.porderTotal}</span>
        <span data-num className="font-display text-xl font-bold">
          {money(total)}
        </span>
      </div>

      <button
        type="button"
        data-press
        disabled={sending}
        onClick={() => {
          if (total === 0) {
            flash.problem(f.needsQuantity);

            return;
          }

          if (!live || supplier === null) {
            /* `POST /v1/suppliers/purchase-orders` needs supplier and ingredient
               ids; this sheet draws the design's rows. See `FLASH.notRecorded`. */
            setSent(money(total));
            flash.problem(f.notRecorded);

            return;
          }

          void send();
        }}
        className={`mt-3.5 grid h-12 w-full place-items-center rounded-md text-sm font-semibold disabled:opacity-45 ${
          total === 0 ? 'bg-bg-muted text-fg-subtle' : 'bg-brand-500 text-white'
        }`}
      >
        {t.text.porderSend}
      </button>

      {sent === null ? null : <Confirmed>{sent}</Confirmed>}

      <Note>{t.text.porderNote}</Note>
    </section>
  );
}

/* ---------------------------------------------------------- shift swap */

export function SwapScreen({
  lang,
  options = { shifts: [], colleagues: [] },
  live = false,
}: {
  lang: Lang;
  /** The caller's own upcoming shifts and their colleagues — `swapOptions()`. */
  options?: SwapOptions;
  live?: boolean;
}) {
  const t = moreCopy(lang);
  const f = copy(FLASH, lang);
  const shared = copy(SHARED, lang);

  /*
   * Nothing is chosen to begin with, which is the design's state and the reason
   * the screen has a guard at all. Pre-selecting the first shift and the first
   * colleague made every press valid — including the press of somebody who
   * opened the screen, read it, and tapped Send without deciding anything, who
   * would have sent a swap request to a colleague they never picked.
   */
  const [shift, setShift] = useState<number | null>(null);
  const [who, setWho] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  /*
   * The live day carries a DATE and the fixture's does not, and that is the
   * defect the read exists to fix: "Payshanba" names a different Thursday every
   * week, so a form headed with a weekday could not say which shift it meant
   * even to the person filling it in.
   */
  const shifts = live
    ? options.shifts.map((row) => ({ id: row.id, day: row.day, time: row.time }))
    : MORE_SWAP_SHIFTS.map((row, index) => ({
        id: row.id,
        day: t.swapShifts[index]?.day ?? '',
        time: t.swapShifts[index]?.time ?? '',
      }));

  const people = live
    ? options.colleagues.map((row) => ({
        id: row.id,
        name: row.name,
        initials: row.initials,
        free: row.role,
      }))
    : MORE_SWAP_PEOPLE.map((row, index) => ({
        id: row.id,
        name: t.swapPeople[index]?.name ?? '',
        initials: t.swapPeople[index]?.initials ?? '',
        free: t.swapPeople[index]?.free ?? '',
      }));

  async function send(shiftIndex: number, whoIndex: number) {
    setSending(true);

    try {
      const response = await fetch('/crew/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftId: realId(shifts[shiftIndex]?.id ?? ''),
          offeredToId: realId(people[whoIndex]?.id ?? ''),
        }),
      });

      if (!response.ok) {
        flash.problem(shared.sendFailed);

        return;
      }

      setSent(`${shifts[shiftIndex]?.day} · ${people[whoIndex]?.name}`);
      flash(f.swapSent);
    } catch {
      flash.problem(shared.sendFailed);
    } finally {
      setSending(false);
    }
  }

  return (
    <section>
      <Wire lang={lang} live={live} />

      <p className="text-fg-subtle text-2xs tracking-caps mb-2.5 font-semibold uppercase">
        {t.text.swapMine}
      </p>

      {shifts.length === 0 ? (
        <Empty>{shared.emptyShifts}</Empty>
      ) : (
        <div className="grid gap-2">
          {shifts.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={shift === index}
              onClick={() => setShift(index)}
              className={`rounded-md border px-4 py-3 text-left ${
                shift === index ? 'border-brand-500 bg-brand-50' : 'border-border bg-surface'
              }`}
            >
              <span className="block text-sm font-semibold">{entry.day}</span>
              <span data-num className="text-fg-subtle text-2xs mt-px block">
                {entry.time}
              </span>
            </button>
          ))}
        </div>
      )}

      <p className="text-fg-subtle text-2xs tracking-caps mt-5.5 mb-2.5 font-semibold uppercase">
        {t.text.swapWho}
      </p>

      <div className="grid gap-2">
        {people.map((person, index) => (
          <button
            key={person.id}
            type="button"
            aria-pressed={who === index}
            onClick={() => setWho(index)}
            className={`flex items-center gap-3 rounded-md border px-4 py-3 text-left ${
              who === index ? 'border-brand-500 bg-brand-50' : 'border-border bg-surface'
            }`}
          >
            <span className="bg-bg-muted text-fg-muted grid size-8 flex-none place-items-center rounded-full text-[11px] font-bold">
              {person.initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{person.name}</span>
              <span className="text-fg-subtle text-2xs mt-px block">{person.free}</span>
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        data-press
        disabled={sending}
        onClick={() => {
          if (shift === null || who === null) {
            flash.problem(f.swapNeedsBoth);

            return;
          }

          if (!live) {
            /* `POST /v1/staff/shift-swaps` needs a shift id and a colleague's
               staff-member id; both lists here are fixtures. */
            setSent(`${shifts[shift]?.day} · ${people[who]?.name}`);
            flash.problem(f.notRecorded);

            return;
          }

          void send(shift, who);
        }}
        className={`mt-5 grid h-12 w-full place-items-center rounded-md text-sm font-semibold disabled:opacity-45 ${
          shift === null || who === null ? 'bg-bg-muted text-fg-subtle' : 'bg-brand-500 text-white'
        }`}
      >
        {t.text.swapSend}
      </button>

      {sent === null ? null : <Confirmed>{sent}</Confirmed>}

      <Note>{t.text.swapNote}</Note>
    </section>
  );
}

/* ------------------------------------------------------- courier handback */

export function HandbackScreen({
  lang,
  drops = [],
  live = false,
}: {
  lang: Lang;
  /** This rider's own open drops — `riderRound()`. */
  drops?: readonly RiderDrop[];
  live?: boolean;
}) {
  const t = moreCopy(lang);
  const f = copy(FLASH, lang);
  const shared = copy(SHARED, lang);

  const [reason, setReason] = useState<number | null>(null);
  /*
   * Which bag, and it is only a question when there is more than one.
   *
   * The design assumes a courier hands back the bag in their hand, which is
   * true for a single drop and wrong for a rider carrying three. Defaulting to
   * the first and never asking would return somebody else's dinner to the
   * queue, so a round of two or more asks; a round of one does not.
   */
  const [drop, setDrop] = useState<number>(0);
  const [sent, setSent] = useState<string | null>(null);

  const sendable = live && drops.length > 0;

  return (
    <section>
      <Wire lang={lang} live={sendable} />

      {live && drops.length === 0 ? <Empty>{shared.emptyDrops}</Empty> : null}

      {drops.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {drops.map((row, index) => (
            <button
              key={row.id}
              type="button"
              aria-pressed={drop === index}
              onClick={() => setDrop(index)}
              className={`rounded-pill h-8.5 border px-3.5 text-xs font-semibold ${
                drop === index
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-border bg-surface text-fg-muted'
              }`}
            >
              <span data-num>{row.number}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/*
       * The reasons are a choice, not a legend.
       *
       * They were drawn as a read-only list of four label/note pairs with a
       * Send button under them, which is a form that sends nothing
       * identifiable: the operator reassigning the order needs to know whether
       * the address was wrong or the guest refused, and those two go to
       * different people afterwards.
       */}
      <div className="grid gap-2">
        {t.handback.map((row, index) => {
          const on = reason === index;

          return (
            <button
              key={row.label}
              type="button"
              data-press
              aria-pressed={on}
              onClick={() => setReason(index)}
              className={`flex items-start gap-3 rounded-md border px-4 py-3 text-left ${
                on ? 'border-brand-500 bg-brand-50' : 'border-border bg-surface'
              }`}
            >
              <span
                aria-hidden
                className={`mt-px grid size-[22px] flex-none place-items-center rounded-full border-[1.5px] text-[11px] font-bold ${
                  on ? 'border-brand-500 bg-brand-500 text-white' : 'border-border-strong'
                }`}
              >
                {on ? '✓' : ''}
              </span>

              <span className="min-w-0">
                <span className="block text-sm font-semibold">{row.label}</span>
                <span className="text-fg-subtle text-2xs mt-px block leading-normal">
                  {row.note}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        data-press
        onClick={() => {
          if (reason === null) {
            flash.problem(f.handbackNeedsReason);

            return;
          }

          setSent(t.handback[reason]?.label ?? null);

          if (!sendable) {
            flash.problem(f.notRecorded);

            return;
          }

          /*
           * A hand-back is `delivery_status` with `failed`, keyed on the ORDER
           * id — which is what `riderRound()` supplies and what this screen
           * never had. Queued rather than posted: a stairwell is exactly where
           * this button gets pressed, and the server keys on `local_id` so a
           * queue that drains twice cannot fail the same drop twice.
           *
           * The reason rides in the payload as a stable code. The journal keeps
           * it whole, and an operator reassigning the order groups by it.
           */
          const chosen = drops[drop];

          if (chosen === undefined) return;

          enqueue(t.text.hbSend, chosen.number, {
            kind: 'delivery_status',
            payload: {
              order_id: Number(chosen.id),
              status: 'failed',
              reason: HANDBACK_REASON_CODES[reason] ?? 'other',
            },
          });

          void drain();
          flash(f.handbackSent);
        }}
        className={`mt-4 grid h-12 w-full place-items-center rounded-md text-sm font-semibold ${
          reason === null ? 'bg-bg-muted text-fg-subtle' : 'bg-brand-500 text-white'
        }`}
      >
        {t.text.hbSend}
      </button>

      {sent === null ? null : <Confirmed>{sent}</Confirmed>}

      <Note>{t.text.hbNote}</Note>
    </section>
  );
}
