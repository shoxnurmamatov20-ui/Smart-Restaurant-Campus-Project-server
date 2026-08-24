import { getLocale, getTranslations } from 'next-intl/server';

import { moduleMetadata } from '../../module-page';
import { PageHead } from '../../screen';
import { STAFF } from '../staff-data';
import { RotaBoard } from './rota-board';
import { BookingList, OpeningChecklist, SwapQueue } from './shift-blocks';
import { ROTA_COPY, say, weekLabel, type Lang } from './shifts-data';
import {
  getBookings,
  getOpeningChecklist,
  getRota,
  getSwappableShifts,
  getSwaps,
} from './shifts-server';

export const generateMetadata = () => moduleMetadata('shifts');

/**
 * The week's rota.
 *
 * Built to the design's Schedule screen: staff down the side, days across, one
 * cell per person per day. The name column is sticky, because a rota is read by
 * scrolling sideways and a row without its name is a row nobody can use.
 *
 * A day off is written rather than left blank. An empty cell in a rota is
 * ambiguous — it could mean off, or it could mean nobody has filled it in yet —
 * and those two are the difference between a quiet Tuesday and an unstaffed one.
 *
 * The design puts four more blocks on this screen and the console had none of
 * them: the hours column with its over-48 and no-rest flags, the cover row, the
 * swap queue, today's bookings, and the opening checklist
 * (`Smart Restaurant OS.dc.html:3581-3871`). A rota with no hours total is a
 * rota nobody can check, and a manager who cannot answer a swap request in the
 * console answers it on the phone and then the published week is wrong.
 *
 * TODO — Phase 1 · staff/shifts, once the module is built:
 *   - Assigning and swapping a shift, and publishing the week
 *   - Unfilled shifts, which the Staff page already counts
 *   - Attendance against the rota: planned versus clocked
 *   - Cost per shift, which feeds the labour line on Branches
 */

/** The seven day headings, in the catalogue's order. */
const DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

/**
 * Who works when.
 *
 * Indexed to match DAYS; `null` is a day off. The shift strings are the ones
 * the Staff screen already shows, so a manager reading both sees one rota.
 *
 * The fallback, when there is no session. The API's week comes from
 * ./shifts-server.ts and arrives already in this shape.
 */
const ROTA: Record<string, readonly (string | null)[]> = {
  aziza: ['09–18', '09–18', '09–18', null, '09–18', '10–19', null],
  jasur: ['10–19', '10–19', null, '10–19', '10–19', '12–22', '12–22'],
  nodira: ['10–19', null, '10–19', '10–19', '12–22', '12–22', '12–22'],
  dilshod: ['08–17', '08–17', '08–17', '08–17', '08–17', null, null],
  bekzod: ['08–20', '08–20', null, '08–20', '08–20', '08–20', null],
  malika: [null, '12–21', '12–21', '12–21', '12–21', '12–21', '12–21'],
  sardor: ['07–15', '07–15', '07–15', '07–15', '07–15', null, null],
};

/**
 * The seven days the grid's headings stand for, Monday first.
 *
 * `Du`, `Se`, `Cho` are seven words that mean a different seven days every
 * week, so publishing cannot be built from the headings — it needs the dates
 * behind them. Monday-first because `shifts-server.ts` lays the grid out that
 * way, and a range that started on Sunday would publish six of the seven
 * columns a manager is looking at plus one they are not.
 */
function weekOf(now: Date): { from: string; to: string } {
  const monday = new Date(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  return { from: isoDay(monday), to: isoDay(sunday) };
}

const isoDay = (at: Date): string =>
  [
    at.getFullYear(),
    String(at.getMonth() + 1).padStart(2, '0'),
    String(at.getDate()).padStart(2, '0'),
  ].join('-');

export default async function ShiftsPage() {
  const [nav, t, staff, locale] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.shifts'),
    getTranslations('console.staff'),
    getLocale(),
  ]);

  const lang = locale as Lang;

  /*
   * The API's week when there is a session, this file's when there is not.
   *
   * The fixture rota is keyed by fixture people, so the two are kept together
   * rather than merged: an API row carries its own name and post, and a
   * fixture row looks its post up in the Staff catalogue.  is what
   * tells the cell below which of the two it is holding.
   */
  const dayLabels = DAYS.map((day) => t(day));
  const week = weekOf(new Date());
  /*
   * The reader's own day, computed once on the server.
   *
   * The checklist is filed against a trading day and the panel is a client
   * island, so the date has to cross the boundary as a string — a `new Date()`
   * in the browser a millisecond the other side of midnight would tick a box on
   * a different day than the one on screen.
   */
  const today = isoDay(new Date());

  const [live, swaps, bookings, checklist, swappable] = await Promise.all([
    getRota(),
    getSwaps(dayLabels),
    /* Tonight's diary. The panel below used to draw the design's four
       bookings unconditionally — guest names and table numbers belonging to
       another restaurant — and the floor screen routes the host here. */
    getBookings({ guests: t('guestsShort'), table: say(ROTA_COPY.table, lang) }),
    /* Today's opening list. `live: false` — no session — leaves the panel
       ticking locally and saying so, which is what it used to do everywhere. */
    getOpeningChecklist(today),
    /* The published shifts the swap form can ask about. Null is the demo
       console, and the form is then not offered rather than offered and
       refused. */
    getSwappableShifts(),
  ]);
  const rows =
    live ??
    STAFF.map((person) => ({
      id: person.id,
      name: person.name,
      role: person.role,
      days: ROTA[person.id] ?? [],
      translated: true,
    }));

  /* The post is resolved here, so the rota and the roster cannot disagree
     about somebody's job, and so the board can stay a plain client island. */
  const people = rows.map((person) => ({
    id: person.id,
    name: person.name,
    role: 'translated' in person ? staff(person.role) : person.role,
    days: person.days,
  }));

  return (
    <>
      <PageHead title={nav('shifts')} subtitle={t('subtitle')} />

      <RotaBoard
        people={people}
        days={DAYS.map((day, index) => ({ label: t(day), weekend: index >= 5 }))}
        week={week}
        lang={lang}
        labels={{
          who: t('who'),
          off: t('off'),
          rota: t('rota'),
          /* The week the grid is actually showing, formatted from the same
             range the board is given. The catalogue's "11–17 avgust" was
             right for one week in 2026 and wrong for every other. */
          rotaSub: weekLabel(week, locale),
        }}
      />

      <SwapQueue requests={swaps} shifts={swappable} lang={lang} />

      <div className="grid items-start gap-[18px] lg:[grid-template-columns:1.25fr_0.95fr]">
        <BookingList lang={lang} bookings={bookings} />
        <OpeningChecklist lang={lang} checklist={checklist} />
      </div>
    </>
  );
}
