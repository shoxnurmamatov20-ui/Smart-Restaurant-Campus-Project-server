'use client';

import { flash } from '@restaurant/ui';
import Link from 'next/link';
import { useState } from 'react';

import { copy, FLASH, TABLE_STATE, TABLES_COPY } from '@restaurant/surfaces/crew/copy';
import {
  CURRENCY_WORD,
  MINUTE_WORD,
  MY_TABLES,
  say,
  WAITER_SHIFT,
  ZONES,
  type Lang,
  type MyTable,
  type TableState,
  type ZoneChip,
  type ZoneKey,
} from '@restaurant/surfaces/crew/data';
import { Som } from '../crew-money';
import { EmptyState, Note } from './bits';

/**
 * A waiter's own section of the floor, six tables at a glance.
 *
 * Two up rather than a floor plan. A plan is what a host needs — where the free
 * table is — and a waiter needs the opposite: which of *my* tables wants
 * something. Sorted the way the design sorts them, which is the order they were
 * sat, so the same table is always in the same place and the grid can be read
 * by position after one shift.
 *
 * **Every state carries a word as well as a colour.** `CLAUDE.md` rule 9, and
 * it earns its place here: this screen is read in a dining room lit for
 * atmosphere by someone walking, and amber against blue at 11px is not a
 * distinction anyone should be asked to make about whether a table has paid.
 */
export function TablesPanel({
  lang,
  role,
  tables = MY_TABLES,
  zones = ZONES,
  live = false,
}: {
  lang: Lang;
  role: string;
  /**
   * This waiter's own tables, joined to their open bills by `crew-server.ts`.
   *
   * Defaulted to the fixtures rather than required, and that is the seam: the
   * panel is a client component and cannot fetch, so the page above it either
   * hands over a live floor or does not. `live` is what lets the screen say
   * which it got — a waiter reading a demo section has to know it is a demo,
   * because the alternative is walking to table 12 to find nobody there.
   */
  tables?: readonly MyTable[];
  zones?: readonly ZoneChip[];
  live?: boolean;
}) {
  const t = copy(TABLES_COPY, lang);
  const states = copy(TABLE_STATE, lang);
  const f = copy(FLASH, lang);

  const [zone, setZone] = useState<ZoneKey>('all');

  /*
   * Totals are masked until asked for.
   *
   * The design does this and it is the right default: a waiter holds this phone
   * at the table, in front of the four people whose bill it is, and the running
   * total of the table behind them is nobody's business. Off by default means
   * the reveal is a decision rather than an accident.
   */
  const [amounts, setAmounts] = useState(false);

  const shown = tables.filter((table) => zone === 'all' || table.zone === zone);

  /* The table the order button opens on — the first free one in the room. */
  const firstFree = shown.find((table) => table.state === 'free');
  const minutes = say(MINUTE_WORD, lang);

  return (
    <section>
      {/* What the shift has been worth so far — the one figure that is theirs. */}
      <div className="rounded-[20px] bg-[var(--crew-hero-bg)] px-5 py-4">
        <p className="text-xs text-[var(--crew-hero-dim)]">{say(WAITER_SHIFT.label, lang)}</p>
        <p className="font-display mt-1.5 flex items-baseline gap-2 text-[30px] leading-none font-bold tracking-tight text-[var(--crew-hero-fg)]">
          <Som tiyin={WAITER_SHIFT.sales} lang={lang} unit={false} />
          {/* The unit in the hero's own dim: `--fg-subtle` is picked against
              white and disappears on this card. */}
          <span className="text-2xs font-normal text-[var(--crew-hero-dim)]">
            {say(CURRENCY_WORD, lang)}
          </span>
        </p>
        <dl
          className="mt-3.5 flex gap-6 border-t pt-3"
          style={{ borderColor: 'var(--crew-hero-line)' }}
        >
          {WAITER_SHIFT.stats.map((stat) => (
            /*
             * `flex-col-reverse`, so the figure sits above its label the way the
             * design draws it while the DOM keeps `<dt>` before `<dd>`. The
             * alternative — a visually hidden label plus a decorative paragraph —
             * puts a `<p>` inside a `<dl>`'s `<div>`, which is invalid and costs
             * the label-to-value association a screen reader relies on.
             */
            <div key={stat.label.en} className="flex flex-col-reverse gap-0.5">
              <dt className="text-[10px] whitespace-nowrap text-[var(--crew-hero-dim)]">
                {say(stat.label, lang)}
              </dt>
              <dd
                data-num
                className="font-display text-[15px] font-bold text-[var(--crew-hero-fg)]"
              >
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* The zone filter. Horizontal because a floor grows zones, and a wrapped
          row of chips pushes the tables themselves below the fold. */}
      <div className="mt-3.5 flex [scrollbar-width:none] gap-2 overflow-x-auto pb-0.5">
        {zones.map((chip) => {
          const on = chip.key === zone;

          return (
            <button
              key={chip.key}
              type="button"
              data-press
              aria-pressed={on}
              onClick={() => setZone(chip.key)}
              className={`h-8 flex-none rounded-full border px-3.5 text-xs font-semibold whitespace-nowrap ${
                on
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-border bg-surface text-fg-muted'
              }`}
            >
              {say(chip.label, lang)}
            </button>
          );
        })}
      </div>

      <div className="mt-3 mb-2.5 flex items-baseline justify-between gap-2">
        {/* The room, then the count — the design names which zone is on screen
            rather than leaving a bare number that reads the same whichever
            chip is selected. */}
        <p data-num className="text-fg-subtle text-2xs tracking-caps font-semibold uppercase">
          {zone === 'all'
            ? t.allZones
            : (zones.find((chip) => chip.key === zone)?.label[lang] ?? zone)}{' '}
          · {shown.length} {t.tables}
        </p>
        <button
          type="button"
          data-press
          aria-pressed={amounts}
          onClick={() => {
            /*
             * Only the reveal is announced. Hiding a total needs no
             * confirmation — the dots are the confirmation — while showing one
             * is a decision taken in front of guests, and the design's line
             * says exactly that.
             */
            setAmounts((on) => {
              if (!on) flash(f.amountsShown);

              return !on;
            });
          }}
          className="border-border bg-surface text-fg-subtle h-[26px] flex-none rounded-full border px-2.5 text-[10px] font-semibold"
        >
          {amounts ? t.hideAmounts : t.showAmounts}
        </button>
      </div>

      {shown.length === 0 ? (
        <EmptyState>{t.empty}</EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5">
          {shown.map((table) => (
            <li key={table.id}>
              <Link
                href={`/crew/${role}/table/${table.id}`}
                data-press
                className={`block h-full rounded-[14px] border px-4 py-3.5 ${cardTone(table.state)}`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-xl font-bold">{table.number}</span>
                  <span data-num className="text-fg-subtle text-2xs">
                    {table.seats} {t.seats}
                  </span>
                </div>

                <p className={`text-2xs mt-1.5 font-semibold ${labelTone(table.state)}`}>
                  {states[table.state]}
                </p>

                <p data-num className="mt-1.5 text-sm font-semibold">
                  {table.total === 0 ? (
                    '—'
                  ) : amounts ? (
                    <Som tiyin={table.total} lang={lang} unit={false} />
                  ) : (
                    /* Six dots, not the figure blurred: a mask that can be read
                       by squinting is not a mask. */
                    <span aria-hidden>••••••</span>
                  )}
                </p>
                <p data-num className="text-fg-subtle text-2xs mt-0.5">
                  {table.state === 'reserved'
                    ? `${table.bookedAt} · ${table.bookedBy}`
                    : table.state === 'free'
                      ? `${t.freeFor} ${table.minutes} ${minutes}`
                      : `${table.minutes} ${minutes}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/*
       * The way into the order flow — `dc.html`, `mf.newOrder`.
       *
       * The grid had no primary action at its foot and a note saying the order
       * flow was not built. It is built (`table/[table]/order`), and this is the
       * design's entry point to it: a waiter walking up to a free table wants
       * one tap, not a tile hunt followed by a second screen.
       *
       * It opens on the first free table because that is what "take an order"
       * means at this moment; a waiter who wants a different one taps its tile.
       * With nothing free the button is a sentence instead — every table in the
       * room is already somebody's.
       */}
      {firstFree === undefined ? (
        <p className="text-fg-subtle mt-4 text-center text-sm">{t.noFreeTable}</p>
      ) : (
        <Link
          data-press
          href={`/crew/${role}/table/${firstFree.id}/order`}
          className="bg-brand-500 mt-4 grid h-13 w-full place-items-center rounded-md text-sm font-semibold text-white"
        >
          {t.newOrder}
        </Link>
      )}

      {!live ? <Note>{t.demoFloor}</Note> : null}
      {!amounts ? <Note>{t.hiddenHint}</Note> : null}
    </section>
  );
}

/**
 * The card's own surface.
 *
 * Occupied is tinted, awaiting-payment carries a solid amber edge, and free and
 * reserved stay on the plain surface — because the thing a waiter is scanning
 * for is the table that needs them, and tinting everything would leave nothing
 * standing out.
 */
function cardTone(state: TableState): string {
  switch (state) {
    case 'occupied':
      return 'border-brand-200 bg-brand-50';
    case 'awaiting-payment':
      return 'border-warning-500 bg-warning-50';
    case 'reserved':
      return 'border-brand-300 bg-surface';
    case 'free':
      return 'border-border bg-surface';
  }
}

function labelTone(state: TableState): string {
  switch (state) {
    case 'occupied':
      return 'text-brand-700';
    case 'awaiting-payment':
      return 'text-warning-700';
    case 'reserved':
      return 'text-brand-700';
    case 'free':
      return 'text-fg-subtle';
  }
}
