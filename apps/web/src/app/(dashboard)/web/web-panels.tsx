'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';
import { flash } from '@restaurant/ui';
import { formatNumber, formatTiyinAmount } from '@restaurant/utils';

import { post } from '@/lib/console-post';

import type { SiteDish, SiteIdentity, SiteTraffic } from './web-server';

import {
  bandFrom,
  BOOKING_RULES,
  BOOKING_STATS,
  COPY_FIELDS,
  copyFieldsFrom,
  type CopyField,
  type OpeningDay,
  FUNNEL,
  hoursOn,
  MOST_VIEWED,
  OPENING_HOURS,
  say,
  SECTIONS,
  SITE_DISHES,
  SLOT_LEGEND,
  SOURCES,
  TIGHT_COVERS,
  TOP_PAGES,
  TRAFFIC_KPIS,
  WEB_COPY,
  WEB_UI,
  WORST_STEP,
  type BookingDay,
  type BookingGrid,
  type Lang,
} from './web-data';

/**
 * Site management's four tabs, `Smart Restaurant OS.dc.html:2585-2823`.
 *
 * Two things here are load-bearing and both were missing. The first is the
 * Publish button: every switch on this screen changes what a stranger sees, so
 * the design does not apply changes as they are made — it collects them and
 * lights the button. Pressing it with nothing pending says so rather than
 * pretending to work. The second is that the traffic tab's funnel names the
 * step that loses the money *and its cause*, which is what makes it a task
 * instead of a chart.
 *
 * What Publish actually writes, and what it cannot
 *
 * The site's configuration IS stored per tenant — `tenants.settings.site`,
 * declared path by path in `apps/api/config/settings.php` and written by
 * `PUT /api/v1/settings/site`. The section switches map onto `sections.*` and
 * go up when Publish is pressed.
 *
 * The rest of this screen does not, and the reason is the same each time: the
 * document declares no path for it. The booking rules, the hour-by-hour window
 * grid and the per-dish visibility on the menu tab have no key in the schema,
 * so they move locally and say so where each one sits. That is the honest
 * half-measure rather than inventing keys the API would refuse — an undeclared
 * path comes back 422 by design, precisely so a typo cannot become a permanent
 * orphan in the document.
 */

const CARD = 'bg-surface rounded-lg border';
const H3 = 'text-md font-semibold';

/** `9` → `09`, so the hour headings above the grid line up as a ruler. */
const pad = (hour: number): string => String(hour).padStart(2, '0');

/** The design's 42×25 switch on the section list, `:2604`. */
function Switch({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`rounded-pill flex h-[25px] w-[42px] flex-none items-center border p-0.5 transition-all ${
        on
          ? 'bg-brand-500 border-brand-500 justify-end'
          : 'bg-bg-muted border-border-strong justify-start'
      }`}
    >
      <span className="size-[19px] rounded-full bg-white shadow-xs" />
    </button>
  );
}

/** The smaller 40×24 switch on the booking rules, `:2734`. */
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

type Dirty = () => void;

/** Which sections are switched off, keyed by the design's own section key. */
type SectionsOff = Readonly<Record<string, boolean>>;

/**
 * The design's section rows against the settings document's own keys.
 *
 * They are not the same words and they should not be forced to be: `SECTIONS`
 * is what the design labels the rows of this list, `sections.*` is what
 * `config/settings.php` declares and what `(site)/r/[restaurant]` reads. Four
 * line up.
 *
 * The four that do not are each a decision rather than an omission:
 *
 *   `hero`, `menu`  locked on, and the API refuses `false` for `sections.home`
 *                   and `sections.menu` outright — a restaurant's website
 *                   without its menu is a page that answers the one question
 *                   every visitor arrived with by saying nothing. Omitted from
 *                   the payload rather than sent as `true`, because a write
 *                   that never changes is a write nobody has to read.
 *   `order`, `gift` no declared path. The switches still move; nothing stores
 *                   them. Adding `sections.order` is a backend change, not a
 *                   console one, and guessing the key here would be a 422 the
 *                   reader could do nothing about.
 *
 * The site document also declares `sections.gallery` and `sections.contact`,
 * which this screen does not draw. They are absent from the payload and the
 * API's merge leaves them exactly as they were — which is what lets the
 * settings screen own its half of the same document without either screen
 * erasing the other's.
 */
const SECTION_PATHS: Readonly<Record<string, string>> = {
  book: 'booking',
  branch: 'branches',
  about: 'about',
  review: 'reviews',
};

/* =================================================================== pages */

function PagesPanel({
  lang,
  markDirty,
  off,
  setOff,
  copyFields,
  hours,
}: {
  lang: Lang;
  markDirty: Dirty;
  /** The copy card's rows — the site document's on a live console, the fixture's otherwise. */
  copyFields: readonly CopyField[];
  /** The venue's own week, or null for the fixture console. */
  hours: readonly OpeningDay[] | null;
  /*
   * Owned by the screen rather than by this panel, because Publish is what
   * sends it and Publish lives in the head. A panel that kept its own copy
   * would be a panel whose switches the button could not see.
   */
  off: SectionsOff;
  setOff: (next: (current: SectionsOff) => SectionsOff) => void;
}) {
  return (
    <div
      data-split
      className="grid [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)] items-start gap-[18px]"
    >
      <section className={`${CARD} overflow-hidden`}>
        <div className="border-divider border-b px-5 py-[18px]">
          <h3 className={H3}>{say(WEB_UI.sectionsHead, lang)}</h3>
          <p className="text-fg-subtle mt-[5px] text-xs leading-normal">
            {say(WEB_UI.sectionsSub, lang)}
          </p>
        </div>

        {SECTIONS.map((section, index) => {
          const on = section.locked || !off[section.key];

          return (
            <div
              key={section.key}
              className="border-divider flex items-center gap-3.5 border-b px-5 py-3.5"
            >
              <span data-num className="text-fg-disabled w-[22px] flex-none font-mono text-xs">
                {String(index + 1).padStart(2, '0')}
              </span>

              <div className="min-w-0 flex-1">
                <div className={`text-sm font-semibold ${on ? '' : 'text-fg-disabled'}`}>
                  {say(section.name, lang)}
                </div>
                <div className="text-fg-subtle mt-0.5 text-xs">{say(section.note, lang)}</div>
              </div>

              {section.locked ? (
                <span className="text-2xs text-fg-disabled flex-none font-semibold">
                  {say(WEB_UI.always, lang)}
                </span>
              ) : (
                <Switch
                  on={on}
                  label={say(section.name, lang)}
                  onClick={() => {
                    setOff((current) => ({ ...current, [section.key]: on }));
                    markDirty();
                  }}
                />
              )}
            </div>
          );
        })}
      </section>

      <div className="grid gap-3.5">
        <section className={`${CARD} px-[22px] py-5`}>
          <h3 className={`${H3} mb-1`}>{say(WEB_UI.copyHead, lang)}</h3>
          <p className="text-fg-subtle mb-4 text-xs leading-normal">{say(WEB_UI.copySub, lang)}</p>

          <div className="grid gap-3.5">
            {copyFields.map((field) => (
              <div key={say(field.label, lang)}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2.5">
                  <span className="text-xs font-semibold">{say(field.label, lang)}</span>
                  {/*
                   * The budget turns amber when the field is empty, not when it
                   * is nearly full: an unwritten closing notice is the one that
                   * shows up blank in Google.
                   */}
                  <span
                    data-num
                    className={`text-2xs ${field.filled ? 'text-fg-subtle' : 'text-warning-600'}`}
                  >
                    {field.count}
                  </span>
                </div>

                <div
                  className="border-border-strong bg-bg-subtle text-fg rounded-md border px-[13px] py-2.5 text-sm leading-normal"
                  style={{ minHeight: field.height }}
                >
                  {say(field.value, lang)}
                </div>

                <div className="text-2xs text-fg-subtle mt-[5px]">{say(field.hint, lang)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className={`${CARD} px-[22px] py-5`}>
          <h3 className={`${H3} mb-1`}>{say(WEB_UI.hoursHead, lang)}</h3>
          <p className="text-fg-subtle mb-[15px] text-xs leading-normal">
            {say(WEB_UI.hoursSub, lang)}
          </p>

          {(hours ?? OPENING_HOURS).map((day) => (
            <div
              key={say(day.day, lang)}
              className="border-divider flex items-center justify-between gap-3 border-b py-[9px]"
            >
              <span className="w-24 flex-none text-sm font-medium">{say(day.day, lang)}</span>
              <span data-num className="flex-1 font-mono text-sm">
                {day.hours}
              </span>
              <span className="text-2xs text-brand-600 flex-none font-semibold">
                {day.today ? say(WEB_UI.today, lang) : ''}
              </span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

/* ============================================================ menu online */

const MENU_COLUMNS =
  'grid [grid-template-columns:minmax(200px,2fr)_90px_1fr_110px_96px_120px] gap-3.5';

function MenuPanel({
  lang,
  markDirty,
  live,
  dishes,
}: {
  lang: Lang;
  markDirty: Dirty;
  /** Whether this render is a real restaurant's. */
  live: boolean;
  /** The menu the website publishes, or null on the demo console. */
  dishes: readonly SiteDish[] | null;
}) {
  const [hidden, setHidden] = useState<readonly string[]>([]);

  /*
   * One list for both, keyed the same way.
   *
   * The design's ten dishes carry invented `photo` and `described` flags; the
   * live ones carry the two columns those flags were invented for —
   * `image_url` and a description in the reader's own language. The third
   * invented figure, "1 840 views", is gone from both: nothing counts a view
   * of a dish, and a number nobody measured is worse than a missing column.
   */
  const rows =
    dishes ??
    SITE_DISHES.map((dish, index) => ({
      id: -index - 1,
      name: say(dish.name, lang),
      categoryName: say(dish.category, lang),
      priceTiyin: dish.price,
      photo: dish.photo,
      described: dish.described,
      available: true,
    }));

  const noPhoto = rows.filter((dish) => !dish.photo).length;
  const noDescription = rows.filter((dish) => !dish.described).length;

  const kpis = [
    {
      label: say(WEB_UI.kpiLive, lang),
      value: `${rows.length - hidden.length} / ${rows.length}`,
      note: say(WEB_UI.kpiLiveNote, lang),
      tone: 'text-fg-subtle',
    },
    {
      label: say(WEB_UI.kpiNoPhoto, lang),
      value: String(noPhoto),
      note: say(WEB_UI.kpiNoPhotoNote, lang),
      tone: 'text-warning-600',
    },
    {
      label: say(WEB_UI.kpiNoDescription, lang),
      value: String(noDescription),
      note: say(WEB_UI.kpiNoDescriptionNote, lang),
      tone: 'text-warning-600',
    },
    /*
     * "Most viewed dish · 1 840 views" is dropped on a live console. Nothing in
     * this platform counts a page view, and the card named a dish from the
     * design file — so on a real restaurant it was a figure and a product
     * neither of which existed.
     */
    ...(live
      ? []
      : [
          {
            label: say(WEB_UI.kpiMostViewed, lang),
            value: formatNumber(MOST_VIEWED.views, lang),
            note: say(MOST_VIEWED.note, lang),
            tone: 'text-fg-subtle',
          },
        ]),
  ];

  return (
    <>
      <div className="mb-[18px] grid [grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`${CARD} px-[18px] py-4`}>
            <div className="text-fg-subtle text-xs">{kpi.label}</div>
            <div data-num className="font-display mt-1.5 text-3xl font-bold tracking-tight">
              {kpi.value}
            </div>
            <div className={`mt-1 text-xs font-medium ${kpi.tone}`}>{kpi.note}</div>
          </div>
        ))}
      </div>

      <section className={`${CARD} overflow-hidden`}>
        <div className="border-divider flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4">
          <div>
            <h3 className={H3}>{say(WEB_UI.menuHead, lang)}</h3>
            <p className="text-fg-subtle mt-[5px] text-xs">{say(WEB_UI.menuSub, lang)}</p>
          </div>

          {/*
           * A link, not a button, and that is the whole fix.
           *
           * It used to raise a toast naming a number — "eight dishes have no
           * photograph" — and leave the reader on a screen with no way to act
           * on it. The uploader is a Menu-module control and it is already
           * live (`POST /api/v1/menu/items/{item}/image`), so what this needed
           * was not an endpoint but a destination: the menu screen, filtered to
           * exactly those dishes, where the drawer that takes the file is.
           *
           * `?filter=no-photo` rather than a click handler because the
           * selection is a place — it survives a refresh and it can be sent to
           * whoever is going to take the photographs.
           */}
          <Link
            href="/menu?filter=no-photo"
            data-press
            className="border-border-strong bg-surface text-fg flex h-[34px] items-center rounded-md border px-3.5 text-sm font-semibold"
          >
            {say(WEB_UI.fixAll, lang)}
          </Link>
        </div>

        <div data-scroll className="overflow-x-auto">
          <div className="min-w-[840px]">
            <div
              className={`${MENU_COLUMNS} bg-bg-subtle text-2xs tracking-caps text-fg-subtle border-b px-5 py-[11px] font-semibold uppercase`}
            >
              <span>{say(WEB_UI.colDish, lang)}</span>
              <span>{say(WEB_UI.colPhoto, lang)}</span>
              <span>{say(WEB_UI.colDescription, lang)}</span>
              <span className="text-right">{say(WEB_UI.colPrice, lang)}</span>
              <span className="text-right">{say(WEB_UI.colViews, lang)}</span>
              <span className="text-right" />
            </div>

            {rows.map((dish) => {
              const key = String(dish.id);
              const shown = !hidden.includes(key);

              return (
                <div
                  key={key}
                  data-row
                  className={`${MENU_COLUMNS} border-divider items-center border-b px-5 py-[13px]`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{dish.name}</div>
                    <div className="text-2xs text-fg-subtle mt-0.5">{dish.categoryName}</div>
                  </div>

                  <span
                    className={`rounded-pill text-2xs justify-self-start px-[9px] py-1 font-semibold ${
                      dish.photo
                        ? 'bg-success-50 text-success-700'
                        : 'bg-warning-50 text-warning-700'
                    }`}
                  >
                    {say(dish.photo ? WEB_UI.photoYes : WEB_UI.photoNo, lang)}
                  </span>

                  <span
                    className={`min-w-0 truncate text-xs ${
                      dish.described ? 'text-fg-muted' : 'text-warning-600'
                    }`}
                  >
                    {say(dish.described ? WEB_UI.written : WEB_UI.notWritten, lang)}
                  </span>

                  <span data-num className="text-right text-sm font-semibold">
                    {formatTiyinAmount(dish.priceTiyin, lang)}
                  </span>

                  {/* The design's "views" column. Nothing counts a view of a
                      DISH — `site_visits` counts pages — so the cell says it
                      does not know rather than printing the design's 1 840
                      against somebody's plov. */}
                  <span data-num className="text-fg-disabled text-right text-sm">
                    —
                  </span>

                  <button
                    type="button"
                    data-press
                    onClick={() => {
                      setHidden((current) =>
                        shown ? [...current, key] : current.filter((entry) => entry !== key),
                      );
                      markDirty();
                    }}
                    className={`text-2xs h-[30px] justify-self-end rounded-md border px-3 font-semibold ${
                      shown
                        ? 'border-border-strong bg-surface text-fg'
                        : 'bg-brand-500 border-brand-500 text-white'
                    }`}
                  >
                    {say(shown ? WEB_UI.hide : WEB_UI.show, lang)}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-bg-subtle border-divider text-fg-muted border-t px-5 py-3.5 text-xs leading-relaxed">
          {say(WEB_UI.menuNote, lang)}
        </div>
      </section>
    </>
  );
}

/* ================================================================ bookings */

/**
 * A weekday and an hour, which is what a booking window actually is.
 *
 * The design drew a flat strip of hours here and the strip was honest about
 * nothing: it closed an hour on a day it did not name, at a venue it did not
 * name, and stored the result in this component. `tables.booking_windows` keeps
 * one row per (branch, weekday, span) — 18:00 to 23:00 on a Friday, in half
 * hours, forty covers a slot — so the strip had to grow the missing axis before
 * it could write anything at all.
 *
 * What a press writes: the whole weekday, as a list of the hours that must be
 * open once it lands. `app/api/tables/booking-windows/route.ts` turns that back
 * into rows, and the shapes are worth knowing while reading this file, because
 * "close one hour" is three different edits against a span table —
 *
 *   inside a service   10:00–23:00, close 15:00 → the row is shortened to
 *                      10:00–15:00 and a second row opens 16:00–23:00. A split.
 *   at the edge        10:00–23:00, close 22:00 → the row is shortened. One
 *                      PATCH, nothing created.
 *   the last hour      18:00–19:00, close 18:00 → the row is deleted, and the
 *                      venue takes no bookings that weekday.
 *
 * The capacity in a tile is that window's own `capacity` column — guests per
 * slot, not tables — and it is read-only here because the design draws no
 * control for it. Zero is a real value and means open and full, which is why a
 * red tile and a grey one are different things on this grid.
 */
function BookingsPanel({
  lang,
  grid,
  weekdays,
}: {
  lang: Lang;
  grid: BookingGrid;
  weekdays: readonly string[];
}) {
  const [days, setDays] = useState<readonly BookingDay[]>(grid.days);
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState<Readonly<Record<string, boolean>>>({});

  // Recomputed from the panel's own state rather than taken from the server's
  // once: opening 23:00 has to widen the grid on the press that opens it.
  const hours = bandFrom(days);

  async function toggle(day: BookingDay, hour: number) {
    if (busy) return;

    const shut = !day.open.some((slot) => slot.hour === hour);
    const wanted = shut
      ? [...day.open.map((slot) => slot.hour), hour]
      : day.open.map((slot) => slot.hour).filter((entry) => entry !== hour);

    const before = days;
    const after = days.map((row) =>
      row.weekday === day.weekday ? { ...row, open: hoursOn(row, wanted) } : row,
    );

    setDays(after);

    const label = `${weekdays[day.weekday - 1] ?? ''} ${pad(hour)}:00`;

    /*
     * A sample grid moves and writes nothing, the same way the prep cards do.
     * `grid.live` is false when `apiGet` had no session to read with, and the
     * hours on screen are then the design's own — posting them would rewrite a
     * real venue's week from figures nobody at that venue chose. The tile still
     * moves, because with no session the sample IS the whole tab and a control
     * that did nothing at all reads as broken rather than as a demonstration.
     */
    if (!grid.live) {
      flash(`${label} · ${say(WEB_UI.slotSample, lang)}`);

      return;
    }

    setBusy(true);

    const answer = await post<{ data?: { hours?: number[] } }>(
      '/api/tables/booking-windows',
      { weekday: day.weekday, hours: wanted, branchId: grid.branchId },
      lang,
    );

    setBusy(false);

    if (!answer.ok) {
      /*
       * The tile goes back where it was, and the API's own sentence says why —
       * `tables.branch_required` for an owner reading the whole estate, a
       * permission refusal for somebody who may edit windows but not delete
       * one. A grid that kept the new colour would be telling a manager the
       * site had stopped taking bookings at seven when it had not.
       */
      setDays(before);
      flash.problem(answer.message ?? say(WEB_COPY.slotSaveFailed, lang));

      return;
    }

    // Reconciled with what the handler says the weekday became, rather than
    // left on the optimistic guess. They agree today; the day they stop, the
    // screen should follow the rows and not this component. An answer that is
    // not the expected shape leaves the tile where the press put it — the write
    // landed, and redrawing an empty weekday over it would be the worse lie.
    const answered = answer.data.data?.hours;
    const settled = Array.isArray(answered) ? answered : wanted;

    setDays((current) =>
      current.map((row) =>
        row.weekday === day.weekday ? { ...row, open: hoursOn(row, settled) } : row,
      ),
    );

    flash(`${label} · ${say(shut ? WEB_COPY.slotOpened : WEB_COPY.slotClosed, lang)}`);
  }

  return (
    <div
      data-split
      className="grid [grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-[18px]"
    >
      <section className={`${CARD} overflow-hidden`}>
        <div className="border-divider border-b px-5 py-[18px]">
          <h3 className={H3}>{say(WEB_UI.slotsHead, lang)}</h3>
          <p className="text-fg-subtle mt-[5px] text-xs leading-normal">
            {say(WEB_UI.slotsSub, lang)}
          </p>

          {grid.live ? null : (
            <p className="text-warning-600 mt-2 text-xs font-semibold">
              {say(WEB_UI.slotSample, lang)}
            </p>
          )}
        </div>

        <div className="px-5 py-[18px]">
          {/*
           * Twenty-four columns will not fit a card, and the band is narrower
           * than that anyway — but a venue that trades from ten until one has
           * fifteen, and a phone-width console has none to spare. So the grid
           * scrolls sideways inside the card rather than squeezing the tiles
           * until the numbers on them stop being legible.
           */}
          <div className="overflow-x-auto">
            <div
              className="grid min-w-max gap-[5px]"
              style={{
                gridTemplateColumns: `minmax(34px,auto) repeat(${hours.length}, minmax(42px,1fr))`,
              }}
            >
              <span />

              {hours.map((hour) => (
                <span
                  key={hour}
                  data-num
                  className="text-2xs text-fg-subtle text-center font-semibold"
                >
                  {pad(hour)}
                </span>
              ))}

              {days.map((day) => (
                <Fragment key={day.weekday}>
                  <span className="text-2xs text-fg-muted self-center font-semibold">
                    {weekdays[day.weekday - 1] ?? ''}
                  </span>

                  {hours.map((hour) => {
                    const slot = day.open.find((entry) => entry.hour === hour);
                    const full = slot !== undefined && slot.capacity === 0;
                    const tight =
                      slot !== undefined && slot.capacity > 0 && slot.capacity <= TIGHT_COVERS;

                    const state =
                      slot === undefined
                        ? WEB_UI.slotClosed
                        : full
                          ? WEB_UI.slotFull
                          : WEB_UI.slotOpen;

                    return (
                      <button
                        key={hour}
                        type="button"
                        data-press
                        disabled={busy}
                        aria-label={`${weekdays[day.weekday - 1] ?? ''} ${pad(hour)}:00 · ${say(
                          state,
                          lang,
                        )}`}
                        onClick={() => void toggle(day, hour)}
                        className="rounded-md border py-[7px] text-center disabled:opacity-60"
                        style={{
                          background:
                            slot === undefined
                              ? 'var(--bg-muted)'
                              : full
                                ? 'var(--danger-50)'
                                : tight
                                  ? 'var(--warning-50)'
                                  : 'var(--surface)',
                          borderColor:
                            slot === undefined
                              ? 'var(--border)'
                              : full
                                ? 'var(--danger-500)'
                                : tight
                                  ? 'var(--warning-500)'
                                  : 'var(--border-strong)',
                        }}
                      >
                        <span
                          data-num
                          className="text-2xs font-bold"
                          style={{
                            color:
                              slot === undefined
                                ? 'var(--fg-disabled)'
                                : full
                                  ? 'var(--danger-700)'
                                  : tight
                                    ? 'var(--warning-700)'
                                    : 'var(--fg)',
                          }}
                        >
                          {slot === undefined ? '·' : formatNumber(slot.capacity, lang)}
                        </span>
                      </button>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-[18px]">
            {SLOT_LEGEND.map((entry) => (
              <span
                key={say(entry.label, lang)}
                className="text-fg-muted flex items-center gap-[7px] text-xs"
              >
                <span
                  aria-hidden
                  className="size-[9px] rounded-[3px] border"
                  style={{ background: entry.bg, borderColor: entry.border }}
                />
                {say(entry.label, lang)}
              </span>
            ))}
          </div>

          <p className="text-fg-subtle mt-2.5 text-xs">{say(WEB_UI.slotCapacityNote, lang)}</p>
        </div>
      </section>

      <div className="grid gap-3.5">
        <section className={`${CARD} px-[22px] py-5`}>
          <h3 className={`${H3} mb-1`}>{say(WEB_UI.bookRulesHead, lang)}</h3>
          <p className="text-fg-subtle mb-4 text-xs leading-normal">
            {say(WEB_UI.bookRulesSub, lang)}
          </p>

          <div className="grid gap-[13px]">
            {BOOKING_RULES.map((rule) => {
              const on = rules[rule.key] ?? rule.on;

              return (
                <div key={rule.key} className="flex items-start gap-3">
                  <RuleSwitch
                    on={on}
                    label={say(rule.label, lang)}
                    onClick={() => {
                      // Written where the booking form reads it, not only into
                      // this component: a switch that survives a reload but
                      // changes nothing is worse than one that refuses.
                      setRules((current) => ({ ...current, [rule.key]: !on }));

                      void post('/api/settings/booking', { rule: rule.key, on: !on }, lang).then(
                        (answer) => {
                          if (answer.ok) return;

                          setRules((current) => ({ ...current, [rule.key]: on }));
                          flash.problem(answer.message ?? say(WEB_UI.saveFailed, lang));
                        },
                      );
                    }}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{say(rule.label, lang)}</div>
                    <div className="text-fg-muted mt-0.5 text-xs leading-normal">
                      {say(rule.note, lang)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className={`${CARD} px-[22px] py-5`}>
          <h3 className={`${H3} mb-3.5`}>{say(WEB_UI.bookStatsHead, lang)}</h3>

          <div className="grid gap-[11px]">
            {BOOKING_STATS.map((stat) => (
              <div
                key={say(stat.label, lang)}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="text-fg-muted min-w-0 text-sm">{say(stat.label, lang)}</span>
                <span
                  data-num
                  className={`font-display text-md flex-none font-bold ${
                    stat.tone === 'warning' ? 'text-warning-600' : ''
                  }`}
                >
                  {stat.value ?? formatTiyinAmount(stat.amount ?? 0, lang)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ================================================================= traffic */

function TrafficPanel({
  lang,
  traffic,
  words,
}: {
  lang: Lang;
  /** The week's visits from `public.site_visits`, or `live: false`. */
  traffic: SiteTraffic;
  words: {
    trafficVisits: string;
    trafficVsBefore: string;
    trafficNone: string;
    trafficPages: string;
    trafficNoConversion: string;
    colPath: string;
  };
}) {
  /*
   * The whole tab was fixture: "4 820 visits this week +18.4%", a 6.1%
   * conversion rate, a source breakdown and a page-view ranking — figures an
   * owner would quote to a marketing agency, for a site that went live
   * yesterday.
   *
   * `public.site_visits` counts them now: a daily aggregate, written by the
   * render of `(site)/r/{slug}` itself, with nothing personal on it. What
   * arrives is visits per day and visits per page.
   *
   * The funnel and the source breakdown do NOT arrive, and stay on the demo,
   * because neither can be derived from what is stored: a conversion rate needs
   * the visit and the order to be one identified journey, which means a session
   * id this table deliberately does not hold so that a marketing figure does
   * not need a cookie banner to exist. The note under the panel says so.
   */
  if (traffic.live) {
    const before = traffic.previousVisits;
    const change = before === 0 ? null : Math.round(((traffic.visits - before) / before) * 100);
    const busiest = Math.max(1, ...traffic.series.map((day) => day.visits));

    return (
      <>
        <div className="mb-[18px] grid [grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-3">
          <div className={`${CARD} px-[18px] py-4`}>
            <div className="text-fg-subtle text-xs">{words.trafficVisits}</div>
            <div data-num className="font-display mt-1.5 text-3xl font-bold tracking-tight">
              {formatNumber(traffic.visits, lang)}
            </div>
            <div
              className={`mt-1 text-xs font-medium ${
                change !== null && change > 0 ? 'text-success-600' : 'text-fg-subtle'
              }`}
            >
              {/* A comparison, not a decoration: the same window one window
                  earlier. With nothing to compare against — a site counting its
                  first week — the clause is left off rather than shown as
                  "+100%". */}
              {change === null
                ? words.trafficVsBefore.replace('{change}', '—')
                : words.trafficVsBefore.replace('{change}', `${change > 0 ? '+' : ''}${change}%`)}
            </div>
          </div>
        </div>

        <div
          data-split
          className="grid [grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-[18px]"
        >
          <section className={`${CARD} px-[22px] py-5`}>
            <h3 className={`${H3} mb-[18px]`}>{words.trafficVisits}</h3>

            {traffic.visits === 0 ? (
              <p className="text-fg-subtle py-8 text-center text-sm">{words.trafficNone}</p>
            ) : (
              <div className="grid gap-2">
                {traffic.series.map((day) => (
                  <div key={day.day} className="flex items-center gap-3">
                    {/* The date as the server sent it, sliced rather than
                        formatted: `Intl` in a client component is a hydration
                        mismatch waiting for Node and a browser to disagree. */}
                    <span data-num className="text-fg-subtle w-12 flex-none font-mono text-xs">
                      {day.day.slice(8, 10)}.{day.day.slice(5, 7)}
                    </span>
                    <div data-rail className="bg-bg-muted h-2 flex-1 overflow-hidden rounded">
                      <div
                        className="bg-brand-500 h-full rounded"
                        style={{ width: `${Math.round((day.visits / busiest) * 100)}%` }}
                      />
                    </div>
                    <span data-num className="w-10 flex-none text-right text-xs font-semibold">
                      {formatNumber(day.visits, lang)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-fg-subtle mt-4 text-xs leading-normal">
              {words.trafficNoConversion}
            </p>
          </section>

          <section className={`${CARD} px-[22px] py-5`}>
            <h3 className={`${H3} mb-3.5`}>{words.trafficPages}</h3>

            {traffic.pages.length === 0 ? (
              <p className="text-fg-subtle py-6 text-center text-sm">{words.trafficNone}</p>
            ) : (
              <div className="grid gap-[11px]">
                {traffic.pages.map((page) => (
                  <div key={page.path} className="flex items-baseline justify-between gap-3">
                    <span className="text-fg-muted min-w-0 truncate font-mono text-xs">
                      {page.path}
                    </span>
                    <span data-num className="font-display text-md flex-none font-bold">
                      {formatNumber(page.visits, lang)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </>
    );
  }

  const first = FUNNEL[0]!;
  const busiest = Math.max(...SOURCES.map((source) => source.visits));
  const allVisits = SOURCES.reduce((sum, source) => sum + source.visits, 0);

  return (
    <>
      <div className="mb-[18px] grid [grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-3">
        {TRAFFIC_KPIS.map((kpi) => (
          <div key={say(kpi.label, lang)} className={`${CARD} px-[18px] py-4`}>
            <div className="text-fg-subtle text-xs">{say(kpi.label, lang)}</div>
            <div data-num className="font-display mt-1.5 text-3xl font-bold tracking-tight">
              {kpi.value}
            </div>
            <div
              className={`mt-1 text-xs font-medium ${
                kpi.tone === 'success' ? 'text-success-600' : 'text-fg-subtle'
              }`}
            >
              {say(kpi.note, lang)}
            </div>
          </div>
        ))}
      </div>

      <div
        data-split
        className="grid [grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-[18px]"
      >
        <section className={`${CARD} px-[22px] py-5`}>
          <h3 className={`${H3} mb-1`}>{say(WEB_UI.funnelHead, lang)}</h3>
          <p className="text-fg-subtle mb-[18px] text-xs leading-normal">
            {say(WEB_UI.funnelSub, lang)}
          </p>

          <div className="grid gap-[13px]">
            {FUNNEL.map((step, index) => (
              <div key={say(step.label, lang)}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{say(step.label, lang)}</span>
                  <span className="flex flex-none items-baseline gap-2.5">
                    <span data-num className="text-sm font-semibold">
                      {formatNumber(step.count, lang)}
                    </span>
                    <span
                      data-num
                      className={`text-2xs w-[52px] text-right ${
                        index === WORST_STEP ? 'text-danger-600' : 'text-fg-subtle'
                      }`}
                    >
                      {step.drop}
                    </span>
                  </span>
                </div>

                <div data-rail className="bg-bg-muted mt-1.5 h-2 overflow-hidden rounded">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${Math.round((step.count / first.count) * 100)}%`,
                      background: index === WORST_STEP ? 'var(--warning-500)' : 'var(--brand-500)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/*
           * The step that loses the money, and why. Four neutral bars are a
           * decoration somebody screenshots for a meeting; the same four with
           * the worst one marked and its cause named are a task.
           */}
          <div className="bg-warning-50 text-warning-700 mt-[18px] rounded-md border border-[rgba(247,144,9,.26)] px-[15px] py-[13px] text-xs leading-relaxed font-medium">
            {say(WEB_UI.funnelWarn, lang)}
          </div>
        </section>

        <div className="grid gap-3.5">
          <section className={`${CARD} px-[22px] py-5`}>
            <h3 className={`${H3} mb-3.5`}>{say(WEB_UI.sourcesHead, lang)}</h3>

            <div className="grid gap-3">
              {SOURCES.map((source) => (
                <div key={say(source.label, lang)}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium">
                      {say(source.label, lang)}
                    </span>
                    <span data-num className="flex-none text-sm font-semibold">
                      {formatNumber(source.visits, lang)}
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
                          width: `${Math.round((source.visits / busiest) * 100)}%`,
                          background: source.colour,
                        }}
                      />
                    </div>
                    <span data-num className="text-2xs text-fg-subtle w-11 flex-none text-right">
                      {Math.round((source.visits / allVisits) * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={`${CARD} px-[22px] py-5`}>
            <h3 className={`${H3} mb-3.5`}>{say(WEB_UI.topPagesHead, lang)}</h3>

            {TOP_PAGES.map((page) => (
              <div
                key={say(page.label, lang)}
                className="border-divider flex items-baseline justify-between gap-3 border-b py-[9px]"
              >
                <span className="min-w-0 truncate text-sm">{say(page.label, lang)}</span>
                <span data-num className="flex-none text-sm font-semibold">
                  {page.views}
                </span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </>
  );
}

/* ============================================================== the screen */

const TABS = [
  { key: 'pages', label: WEB_UI.tabPages },
  { key: 'menu', label: WEB_UI.tabMenu },
  { key: 'book', label: WEB_UI.tabBook },
  { key: 'stats', label: WEB_UI.tabStats },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/**
 * Head with the live domain and the Publish button, then the strip.
 *
 * The shared `<Tabs>` cannot carry the domain pill, and the Publish button has
 * to read a `dirty` flag that only this component owns — so the strip's classes
 * are copied from it rather than borrowed.
 */
export function WebScreen({
  lang,
  title,
  subtitle,
  bookings,
  weekdays,
  site,
  words,
  dishes,
  traffic,
}: {
  lang: Lang;
  title: string;
  subtitle: string;
  /**
   * This restaurant's own public address — see `getSiteIdentity()`.
   *
   * The head used to print the demo's URL from `web-data.ts` beside a green
   * dot, on every console.
   */
  site: SiteIdentity;
  /** Sentences the panels need that are not in this screen's own copy file. */
  words: {
    sampleContent: string;
    addressUnknown: string;
    /** The traffic tab's own sentences, resolved on the server. */
    trafficVisits: string;
    trafficVsBefore: string;
    trafficNone: string;
    trafficPages: string;
    trafficNoConversion: string;
    colPath: string;
  };
  /**
   * The venue's own booking windows, resolved on the server.
   *
   * Handed down rather than fetched here for the reason every live console
   * screen does it: the session token is an httpOnly cookie, so the read has to
   * happen where `next/headers` can see it.
   */
  bookings: BookingGrid;
  /** Seven weekday names, Monday first, already in the reader's language. */
  weekdays: readonly string[];
  /**
   * The menu as the website publishes it, or null on the demo console.
   *
   * An empty list is a real answer — a restaurant with no dishes has none — and
   * the tab says so rather than falling back to the design's ten.
   */
  dishes: readonly SiteDish[] | null;
  /** The week's visits. `live: false` means nothing has been counted here. */
  traffic: SiteTraffic;
}) {
  const [tab, setTab] = useState<TabKey>('pages');
  const [dirty, setDirty] = useState(false);
  /*
   * The switches, seeded from the settings document.
   *
   * They used to start empty on every console — every section drawn as on,
   * whatever the site was actually publishing — so a restaurant that had turned
   * its reviews section off saw it lit here and the first Publish turned it
   * back on. `SECTION_PATHS` maps the design's row keys to the document's, and
   * the seed runs it backwards.
   */
  const [off, setOff] = useState<SectionsOff>(() => {
    const state: Record<string, boolean> = {};

    for (const [row, path] of Object.entries(SECTION_PATHS)) {
      if (site.sectionsOff.includes(path)) state[row] = true;
    }

    return state;
  });
  const [publishing, setPublishing] = useState(false);

  const markDirty = () => setDirty(true);

  async function publish() {
    if (!dirty) {
      flash.problem(say(WEB_COPY.nothingChanged, lang));

      return;
    }

    /*
     * Only the paths the document declares, and only the ones this screen
     * owns. `SECTION_PATHS` explains which four those are and why the other
     * four are absent; an undeclared key would come back 422 naming itself,
     * which is right for a typo and useless as a feature.
     */
    const sections: Record<string, boolean> = {};

    for (const section of SECTIONS) {
      const path = SECTION_PATHS[section.key];

      if (path !== undefined) sections[path] = !off[section.key];
    }

    setPublishing(true);

    const answer = await post('/api/settings/site', { sections }, lang);

    /*
     * Saved is not published, and this screen's button says the second word.
     *
     * `PUT /settings/site` writes the DRAFT — which is what the settings screen
     * beside this one edits all afternoon — and `POST /settings/site/publish`
     * takes the snapshot `GET /public/site` serves to strangers. Two calls
     * rather than one flag, because they are two acts: a marketer saves twenty
     * times and publishes once.
     *
     * The second only runs if the first landed. Publishing a draft that failed
     * to save would put the previous version live and report success.
     */
    const live = answer.ok ? await post('/api/settings/site/publish', {}, lang) : answer;

    setPublishing(false);

    if (!live.ok) {
      flash.problem(live.message ?? say(WEB_UI.publish, lang));

      return;
    }

    if (!answer.ok) {
      /*
       * The API's own sentence when it sent one — it names the path it refused,
       * and `PUT /settings/site` sits on `system.settings`, which by the RBAC
       * seeder only the owner and the platform operator hold. A branch manager
       * can open this screen and cannot publish from it, so the refusal has to
       * be legible rather than silent.
       *
       * The button's own label is the fallback, in red. Deliberately not
       * `nothingChanged` — that one says "everything is live", which is the
       * opposite of what just happened.
       */
      flash.problem(answer.message ?? say(WEB_UI.publish, lang));

      return;
    }

    /*
     * Clean again only after the write landed.
     *
     * A button that went grey on the press and then failed would leave somebody
     * believing a closed section is off the public site when it is still on it
     * — which is the one mistake this screen exists to prevent.
     */
    setDirty(false);
    flash(say(WEB_COPY.publishedNote, lang));
  }

  return (
    <>
      <div data-pagehead className="mb-5 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="text-fg-muted mt-1.5 text-sm">{subtitle}</p>
        </div>

        <div className="flex flex-none items-center gap-2.5">
          {/* A green dot means "this is on the internet". It is only earned
              when the address is this restaurant's own. */}
          <span
            className={`rounded-pill flex h-8 items-center gap-[7px] px-3 text-xs font-semibold ${
              site.live ? 'bg-success-50 text-success-700' : 'bg-bg-muted text-fg-muted'
            }`}
          >
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${site.live ? 'bg-success-500' : 'bg-fg-disabled'}`}
            />
            {site.live ? site.address : words.addressUnknown}
          </span>

          {/*
           * Two writes through the route handlers: `PUT /settings/site` saves
           * the draft, `POST /settings/site/publish` makes it the page a
           * stranger reads. The save merges rather than replaces, which is what
           * keeps this button and the settings screen from overwriting each
           * other's half of the same document; the publish is what stops a
           * half-rewritten blurb being on the internet while somebody is still
           * writing it.
           */}
          <button
            type="button"
            data-press
            disabled={publishing}
            onClick={() => void publish()}
            className={`h-9 rounded-md px-[15px] text-sm font-semibold whitespace-nowrap disabled:opacity-50 ${
              dirty
                ? 'bg-brand-500 hover:bg-brand-600 text-white'
                : 'bg-surface text-fg-muted border'
            }`}
          >
            {say(dirty ? WEB_UI.publish : WEB_UI.published, lang)}
          </button>
        </div>
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
        id="panel-pages"
        role="tabpanel"
        hidden={tab !== 'pages'}
        data-panel-in={tab === 'pages' ? '' : undefined}
      >
        {site.live ? <SampleNote>{words.sampleContent}</SampleNote> : null}
        <PagesPanel
          lang={lang}
          markDirty={markDirty}
          off={off}
          setOff={setOff}
          copyFields={site.copy === null ? COPY_FIELDS : copyFieldsFrom(site.copy)}
          hours={site.hours}
        />
      </div>

      <div
        id="panel-menu"
        role="tabpanel"
        hidden={tab !== 'menu'}
        data-panel-in={tab === 'menu' ? '' : undefined}
      >
        {/* Only when the dishes are still the design's. A live menu is this
            restaurant's own and needs no disclaimer. */}
        {dishes === null ? <SampleNote>{words.sampleContent}</SampleNote> : null}
        <MenuPanel lang={lang} markDirty={markDirty} live={site.live} dishes={dishes} />
      </div>

      <div
        id="panel-book"
        role="tabpanel"
        hidden={tab !== 'book'}
        data-panel-in={tab === 'book' ? '' : undefined}
      >
        <BookingsPanel lang={lang} grid={bookings} weekdays={weekdays} />
      </div>

      <div
        id="panel-stats"
        role="tabpanel"
        hidden={tab !== 'stats'}
        data-panel-in={tab === 'stats' ? '' : undefined}
      >
        <TrafficPanel lang={lang} traffic={traffic} words={words} />
      </div>
    </>
  );
}

/** The line that says the block under it is the design's data, not yours. */
function SampleNote({ children }: { children: string }) {
  return (
    <p className="border-warning-500/30 bg-warning-50 text-warning-700 mb-4 rounded-md border px-3.5 py-2.5 text-xs leading-normal">
      {children}
    </p>
  );
}
