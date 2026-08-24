'use client';

import { flash } from '@restaurant/ui';
import { useState } from 'react';

import { copy, fill, FLASH, MORE_COPY, SHARED } from '@restaurant/surfaces/crew/copy';
import { DROPS, type Lang } from '@restaurant/surfaces/crew/data';
import type { RiderDrop } from '@restaurant/surfaces/crew/live';
import { moreCopy } from '@restaurant/surfaces/crew/more-copy';
import { MORE_CLOSING, MORE_END_SHIFT } from '@restaurant/surfaces/crew/more-data';
import { drain, enqueue } from '../crew-queue';
//  is printed by the screens above these islands, not here.

/**
 * The interactive islands the read-only More screens hang off.
 *
 * `more-screens.tsx` renders twelve screens on the server, which is right for
 * eleven of them: they are figures and prose, and hydrating a phone to draw a
 * list of six names is a cost with no return. Three of them are not read-only
 * — a manager ticks off the steps of closing a shift, a courier presses the
 * button that tells them what is still holding it up, and a desktop-only row
 * says where the work actually lives — so the buttons live here, in one small
 * client module, rather than turning the whole file client-side.
 *
 * **Every press says something.** The design calls `flash()` on all of them,
 * and on a phone held at arm's length in a service corridor it is the only
 * unambiguous feedback there is: a tick that appears below the fold and a
 * button that dims are both easy to miss while walking.
 */

/* --------------------------------------------------------------- one button */

/**
 * A control whose whole effect is to say something.
 *
 * Not a decoration for missing plumbing: three of the design's own buttons do
 * exactly this — the desktop row, the transfer action, "opens on the tablet
 * POS" — because the answer to the press is a fact, not a write. Where a screen
 * genuinely cannot do the thing, `flash.problem` is used instead, which drops
 * the check and holds longer.
 */
export function FlashButton({
  label,
  message,
  problem = false,
  className,
  children,
}: {
  label?: string;
  message: string;
  problem?: boolean;
  className: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-press
      onClick={() => (problem ? flash.problem(message) : flash(message))}
      className={className}
    >
      {children ?? label}
    </button>
  );
}

/* ------------------------------------------------------ manager · the close */

/**
 * The five steps of closing a shift, and the three a manager can tick here.
 *
 * The list was drawn and inert: `MORE_CLOSING` marks three steps `actionable`
 * and the screen rendered no control for any of them, so a manager read five
 * lines, saw a permanently dead button underneath, and learned nothing about
 * what to do next. The design puts a *Do it* on each outstanding step and lets
 * the close button come alive when the last one is ticked.
 *
 * **Ticking is local, and it stays local.** The note under the list has always
 * said so and the reason is the endpoint rather than a missing one:
 * `POST /api/v1/finance/shifts/{shift}/close` does not take a checklist — it
 * takes a **counted drawer**, note by note, and derives the difference from it.
 * There is no step on it for "I checked the fridges". So this list is what it
 * looks like: the manager's own run-through before they walk to the till, and
 * the close itself happens there, with the notes in a hand.
 *
 * That is also why the last step is somebody else's and says so in its own
 * line. A phone that could close a shift without a count would produce a Z
 * report against a number nobody counted, which is the one document in this
 * business that has to be arithmetic rather than assertion.
 */
export function ClosingChecklist({
  lang,
  ticked = [],
  live = false,
}: {
  lang: Lang;
  /** `list:step` for every tick the server holds for today — `crewChecklist()`. */
  ticked?: readonly string[];
  live?: boolean;
}) {
  const t = moreCopy(lang);
  const f = copy(FLASH, lang);
  const shared = copy(SHARED, lang);

  /*
   * The server's ticks are the starting state, this set is what has happened
   * since. Two collections rather than one because the queue is optimistic: a
   * press has to show immediately and the row must not un-tick itself while
   * the drain is in flight.
   */
  const [pressed, setPressed] = useState<ReadonlySet<number>>(new Set());

  const fromServer = new Set(ticked);

  const isDone = (index: number) => {
    const key = MORE_CLOSING[index]?.key;

    if (key !== undefined && fromServer.has(`closing:${key}`)) return true;

    // The fixture's opening state is only believed when there is no server
    // answer to believe instead — otherwise a live handset would open with two
    // steps ticked that nobody did.
    return (!live && (MORE_CLOSING[index]?.done ?? false)) || pressed.has(index);
  };

  const ready = MORE_CLOSING.every((_, index) => isDone(index));

  return (
    <>
      {/* Which of the two promises this list is making, said above it. */}
      <p
        className={`text-2xs mb-3.5 rounded-[10px] px-3 py-2.5 leading-normal ${
          live ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700'
        }`}
      >
        {live ? shared.queued : shared.notWired}
      </p>

      <div className="border-border mb-4 overflow-hidden rounded-lg border">
        {t.closing.map((step, index) => {
          const done = isDone(index);
          const actionable = !done && (MORE_CLOSING[index]?.actionable ?? false);

          return (
            <div
              key={step.label}
              className="border-divider flex items-center gap-3 border-b px-4 py-3.5 last:border-0"
            >
              <span
                aria-hidden
                className={`grid size-[22px] flex-none place-items-center rounded-full border-[1.5px] text-[11px] font-bold ${
                  done
                    ? 'border-success-500 bg-success-500 text-white'
                    : 'border-border-strong text-fg-subtle'
                }`}
              >
                {done ? '✓' : index + 1}
              </span>

              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-semibold ${done ? '' : 'text-fg-muted'}`}>
                  {step.label}
                </span>
                <span className="text-fg-subtle text-2xs mt-px block">{step.note}</span>
              </span>

              {actionable ? (
                <button
                  type="button"
                  data-press
                  onClick={() => {
                    setPressed((current) => new Set(current).add(index));

                    const key = MORE_CLOSING[index]?.key;

                    if (live && key !== undefined) {
                      /*
                       * `checklist_tick` — the tenth verb, and the reason this
                       * list is worth ticking at all. It writes to
                       * `staff.actions` and nowhere else: what matters about
                       * "I checked the fridges" is who said it and when, which
                       * is what an append-only journal is.
                       *
                       * Queued, because a walk-in fridge at midnight is where
                       * this gets pressed.
                       */
                      enqueue(t.text.closeDo, step.label, {
                        kind: 'checklist_tick',
                        payload: { list: 'closing', step: key },
                      });

                      void drain();
                    }

                    flash(f.stepDone);
                  }}
                  aria-label={`${t.text.closeDo} — ${step.label}`}
                  className="border-border-strong bg-surface text-fg h-9 flex-none rounded-[10px] border px-3 text-xs font-semibold"
                >
                  {t.text.closeDo}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <FlashButton
        label={t.text.closeCta}
        message={ready ? f.shiftClosed : f.conditionsFirst}
        problem={!ready}
        className={`grid h-12.5 w-full place-items-center rounded-md text-sm font-semibold ${
          ready ? 'bg-brand-500 text-white' : 'bg-bg-muted text-fg-subtle'
        }`}
      />

      {/*
       * No note here: `ClosingScreen` prints `closeNote` under this island
       * already, and the strip above the list is what says whether the ticks
       * leave the phone. The one that used to sit here said they never do,
       * which stopped being true when `checklist_tick` landed.
       */}
    </>
  );
}

/* ------------------------------------------------- courier · end of shift */

/**
 * The four conditions a courier's shift ends on, and the one that is not met.
 *
 * The first row is derived rather than written down: it counts the drops that
 * are still open, so the list cannot say "all orders closed" while the
 * deliveries tab two taps away shows two of them waiting. The design derives it
 * the same way and for the same reason.
 *
 * The button is live and refuses, which is the design's behaviour: pressing it
 * names the single thing still in the way. A dimmed control that says nothing
 * leaves a courier standing at the back door guessing which of four lines it
 * meant.
 */
export function EndShiftChecklist({
  lang,
  drops,
  declaredTiyin = null,
  live = false,
}: {
  lang: Lang;
  /** This rider's own round — `riderRound()`. Undefined falls back to the fixture. */
  drops?: readonly RiderDrop[];
  /** What they declared carrying today — `crewChecklist()`. */
  declaredTiyin?: number | null;
  live?: boolean;
}) {
  const t = moreCopy(lang);
  const f = copy(FLASH, lang);

  /*
   * A live round holds only what is still out — `deliveries/mine` is scoped to
   * `live()` deliveries — so every row on it is an open drop. The fixture
   * carries finished ones too and has to be filtered.
   */
  const open =
    live && drops !== undefined
      ? drops.length
      : DROPS.filter((drop) => drop.state !== 'delivered').length;

  /*
   * What the closing message reports, counted from the round rather than
   * written down. `f.courierShiftClosed` said "8 yetkazish · 96 000 so'm" to
   * every courier on the platform — the last figure a rider reads before
   * handing money to a cashier, and the one they are held to if it disagrees.
   */
  const delivered = DROPS.filter((drop) => drop.state === 'delivered');
  const collected = delivered
    .filter((drop) => drop.collectCash)
    .reduce((sum, drop) => sum + drop.total, 0);

  /*
   * Handing the cash in happens on the courier's own cash screen, and the two
   * screens now agree because both read it from the same place: the day's
   * `cash_handover` row. Until that endpoint existed this read the fixture and
   * the two panels could contradict each other on one phone.
   */
  const cashHanded = live ? declaredTiyin !== null : (MORE_END_SHIFT[1]?.done ?? false);

  const doneAt = (index: number): boolean =>
    index === 0 ? open === 0 : index === 1 ? cashHanded : (MORE_END_SHIFT[index]?.done ?? false);

  const ready = open === 0 && cashHanded;

  return (
    <>
      <div className="border-border mb-4 overflow-hidden rounded-lg border">
        {t.endShift.map((row, index) => {
          const done = doneAt(index);

          return (
            <div
              key={row.label}
              className="border-divider flex items-center gap-3 border-b px-4 py-3.5 last:border-0"
            >
              <span
                aria-hidden
                className={`grid size-[22px] flex-none place-items-center rounded-full border-[1.5px] text-[11px] font-bold ${
                  done
                    ? 'border-success-500 bg-success-500 text-white'
                    : 'border-border-strong text-fg-subtle'
                }`}
              >
                {done ? '✓' : ''}
              </span>

              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-semibold ${done ? '' : 'text-fg-muted'}`}>
                  {row.label}
                </span>
                <span data-num className="text-fg-subtle text-2xs mt-px block">
                  {index === 0 ? fill(row.note, { n: open }) : row.note}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      <FlashButton
        label={t.text.endCta}
        message={
          open > 0
            ? fill(f.dropsStillOpen, { n: open })
            : !cashHanded
              ? f.cashFirst
              : fill(f.courierShiftClosed, {
                  n: delivered.length,
                  amount: new Intl.NumberFormat('uz-UZ').format(Math.round(collected / 100)),
                })
        }
        problem={!ready}
        className={`grid h-12.5 w-full place-items-center rounded-md text-sm font-semibold ${
          ready ? 'bg-brand-500 text-white' : 'bg-bg-muted text-fg-subtle'
        }`}
      />
    </>
  );
}

/* ------------------------------------------------------- more · desktop row */

/**
 * The row that names work which is deliberately not coming to a phone.
 *
 * It was a dimmed `div` with a chip reading "on desktop", which answers the
 * wrong half of the question: a manager looking for the menu editor knows it is
 * not here, and wants to be told where it is. The design makes it a control
 * whose whole job is to say so.
 */
export function DesktopRow({
  lang,
  className,
  children,
}: {
  lang: Lang;
  className: string;
  children: React.ReactNode;
}) {
  const t = copy(MORE_COPY, lang);
  const f = copy(FLASH, lang);

  return (
    <button
      type="button"
      data-press
      aria-label={t.desktopOpen}
      onClick={() => flash(f.desktopOnly)}
      className={className}
    >
      {children}
    </button>
  );
}
