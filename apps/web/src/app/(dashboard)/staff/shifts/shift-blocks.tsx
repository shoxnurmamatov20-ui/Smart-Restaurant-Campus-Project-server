'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { flash } from '@restaurant/ui';

import { apiId, post } from '@/lib/console-post';

import type { OpeningChecklist as OpeningChecklistData, SwappableShift } from './shifts-server';

import {
  BOOKINGS,
  OPENING_CHECKLIST,
  ROTA_COPY,
  say,
  SWAP_REQUESTS,
  type Booking,
  type BookingState,
  type Lang,
  type SwapRow,
} from './shifts-data';

/**
 * The three blocks under the rota: swaps, today's bookings, and the checklist.
 *
 * All three are in the design and none were here. They are one component
 * because they share a screen and a language, not because they share state —
 * each holds its own.
 *
 * Two of the three write to the server — swaps through
 * `POST /api/staff/shift-swap`, bookings through
 * `POST /api/tables/reservations` — and both settle the row on screen before
 * the answer comes back, because a list that jumps while a request is in flight
 * is a list somebody taps twice. The opening checklist stays local: a ticked box
 * is a note to the person holding the tablet, and there is no `staff.checklists`
 * table for it to land in.
 */

/* ------------------------------------------------------------------ swaps */

type Verdict = 'ok' | 'no';

export function SwapQueue({
  requests,
  shifts = null,
  lang,
}: {
  /**
   * The published shifts somebody can ask to be let off, or null.
   *
   * Null is the demo console — no session behind the render — and the form is
   * then not offered at all rather than offered and refused: a picker with no
   * real shift ids in it cannot produce a request the API would accept.
   */
  shifts?: readonly SwappableShift[] | null;
  /**
   * The queue from the API, or `null` when there is no session behind this
   * render — in which case the fixture queue below stands in, as it does
   * everywhere else in the console.
   */
  requests: readonly SwapRow[] | null;
  lang: Lang;
}) {
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const rows =
    requests ??
    SWAP_REQUESTS.map((row) => ({
      id: row.id,
      from: row.from,
      to: row.to,
      day: row.day,
      reason: say(row.reason, lang),
    }));

  const pending = rows.filter((row) => verdicts[row.id] === undefined).length;

  function decide(id: string, verdict: Verdict) {
    /*
     * The row settles before the answer and stays settled whatever comes back.
     * A queue whose rows jump back when a request is in flight is a queue a
     * manager double-taps; a refusal says so in the toast, which is where they
     * are already looking.
     */
    setVerdicts((state) => ({ ...state, [id]: verdict }));

    const told =
      verdict === 'ok'
        ? say(ROTA_COPY.swapApprovedFlash, lang)
        : say(ROTA_COPY.swapRejectedFlash, lang);

    /*
     * A fixture row — the demo queue carries `s1`, `s2`. The toast is the whole
     * feature on a console with no session behind it.
     */
    if (apiId(id) === null) {
      flash(told);

      return;
    }

    void post(
      '/api/staff/shift-swap',
      { swapId: apiId(id), verdict: verdict === 'ok' ? 'approve' : 'reject' },
      lang,
    ).then((answer) => {
      if (answer.ok) {
        flash(told);

        return;
      }

      flash.problem(answer.message ?? told);
    });
  }

  return (
    <>
      {/*
        The "request a swap" form.

        It used to collect a person and a weekday HEADING and flash "so'rov
        yuborildi" — posting nothing, so the request reached no manager and
        appeared in no queue. The endpoint was never what was missing: `POST
        /v1/staff/shift-swaps` takes a SHIFT id — one person, one day, one slot
        — and «Payshanba» names a different Thursday every week. The picker is
        fed from the published rota, so what is asked about is a row that
        exists.
      */}
      {shifts === null ? null : <SwapRequest shifts={shifts} lang={lang} />}

      <section className="bg-surface mb-[18px] overflow-hidden rounded-lg border">
        <div className="border-divider flex flex-wrap items-baseline justify-between gap-3 border-b px-5 pt-4 pb-3.5">
          <div>
            <h3 className="text-md tracking-snug font-semibold">{say(ROTA_COPY.swapHead, lang)}</h3>
            <p className="text-fg-subtle mt-1 text-xs">{say(ROTA_COPY.swapSub, lang)}</p>
          </div>

          <span className="flex items-center gap-3">
            <span data-num className="text-fg-subtle text-xs">
              {pending} {say(ROTA_COPY.swapPendingCount, lang)}
            </span>
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="text-fg-subtle px-5 py-[22px] text-center text-sm">
            {say(ROTA_COPY.swapEmpty, lang)}
          </p>
        ) : (
          rows.map((row) => {
            const verdict = verdicts[row.id];

            const chip =
              verdict === 'ok'
                ? 'bg-success-50 text-success-700'
                : verdict === 'no'
                  ? 'bg-bg-muted text-fg-subtle'
                  : 'bg-warning-50 text-warning-700';

            const word =
              verdict === 'ok'
                ? say(ROTA_COPY.swapApproved, lang)
                : verdict === 'no'
                  ? say(ROTA_COPY.swapRejected, lang)
                  : say(ROTA_COPY.swapPending, lang);

            return (
              <div
                key={row.id}
                data-row
                className="border-divider flex flex-wrap items-center gap-3.5 border-b px-5 py-3"
              >
                <span className="min-w-[180px] flex-1">
                  <span className="block text-sm font-semibold">
                    {row.from} → {row.to}
                  </span>
                  <span className="text-fg-subtle mt-0.5 block text-xs">{row.reason}</span>
                </span>

                <span data-num className="text-fg-muted flex-none text-sm">
                  {row.day}
                </span>

                <span
                  className={`rounded-pill text-2xs flex-none px-2.5 py-1 font-semibold ${chip}`}
                >
                  {word}
                </span>

                {verdict === undefined ? (
                  <span className="flex flex-none gap-2">
                    <button
                      type="button"
                      data-press
                      onClick={() => decide(row.id, 'no')}
                      className="bg-surface border-border-strong text-fg-muted hover:bg-danger-50 hover:text-danger-600 h-[30px] rounded-md border px-3 text-xs font-semibold"
                    >
                      {say(ROTA_COPY.swapReject, lang)}
                    </button>
                    <button
                      type="button"
                      data-press
                      onClick={() => decide(row.id, 'ok')}
                      className="bg-brand-500 hover:bg-brand-600 h-[30px] rounded-md px-3 text-xs font-semibold text-white"
                    >
                      {say(ROTA_COPY.swapApprove, lang)}
                    </button>
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </section>
    </>
  );
}

/* --------------------------------------------------------------- bookings */

const STATE_CHIP: Record<BookingState, string> = {
  confirmed: 'bg-success-50 text-success-700',
  prepaid: 'bg-brand-50 text-brand-700',
  pending: 'bg-warning-50 text-warning-700',
  moved: 'bg-brand-50 text-brand-700',
};

type Row = { id: string; time: string; who: string; detail: string; state: BookingState };

/**
 * `19:00` in the diary, a timestamp the endpoint will accept.
 *
 * `starts_at` is validated `after:now`, so a bare time is not enough — the day
 * has to be decided, and it is decided here rather than in the route handler
 * because the person typing is standing in the restaurant and their clock is
 * the room's clock. A time that has already gone today is tomorrow: "19:00"
 * said at eight in the evening is never tonight, and filing it as tonight would
 * be a booking the API refuses with a validation error nobody can act on.
 *
 * `now` is a parameter so a test can assert a date rather than "roughly today".
 */
export function bookingStartsAt(hhmm: string, now: Date): string | null {
  const parts = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());

  if (parts === null) return null;

  const hours = Number(parts[1]);
  const minutes = Number(parts[2]);

  if (hours > 23 || minutes > 59) return null;

  const at = new Date(now);
  at.setHours(hours, minutes, 0, 0);

  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);

  return at.toISOString();
}

export function BookingList({
  lang,
  bookings = null,
}: {
  lang: Lang;
  /**
   * Tonight's diary from the API, or null for the demo console.
   *
   * This panel used to build its rows from `BOOKINGS` with no fetch at all, so
   * a restaurant with an empty diary was shown guest names, party sizes and
   * table numbers belonging to somebody else — and the floor screen's
   * "Reservations" button sends the host straight here to plan the evening.
   *
   * An empty array is a real answer and stays empty. Null is the fixture
   * console, and only then are the design's four bookings drawn.
   */
  bookings?: readonly Row[] | null;
}) {
  /*
   * One sentence from the shared catalogue, for the one case the API cannot
   * word itself: a network failure, where there is no error envelope to read a
   * message off. `ROTA_COPY` is this screen's own copy and every line in it
   * describes something that worked.
   */
  const problem = useTranslations('errors');
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [dropped, setDropped] = useState<readonly string[]>([]);
  const [moved, setMoved] = useState<Record<string, { time: string; table: string }>>({});
  const [extra, setExtra] = useState<readonly Row[]>([]);

  const [time, setTime] = useState('');
  const [name, setName] = useState('');
  const [guests, setGuests] = useState('');
  const [table, setTable] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');

  const [moving, setMoving] = useState<Row | null>(null);
  const [newTime, setNewTime] = useState('');
  const [newTable, setNewTable] = useState('');

  const base: readonly Row[] =
    bookings ??
    BOOKINGS.map((booking: Booking) => ({
      id: booking.id,
      time: booking.time,
      who: say(booking.who, lang),
      detail: say(booking.detail, lang),
      state: booking.state,
    }));

  const rows = [...base, ...extra]
    .filter((row) => !dropped.includes(row.id))
    .map((row) => {
      const change = moved[row.id];

      if (change === undefined) return row;

      return {
        ...row,
        time: change.time,
        detail:
          change.table === ''
            ? row.detail
            : `${say(ROTA_COPY.table, lang)} ${change.table} · ${row.detail}`,
        state: 'moved' as const,
      };
    })
    .sort((a, b) => (a.time < b.time ? -1 : 1));

  const label: Record<BookingState, string> = {
    confirmed: say(ROTA_COPY.stateConfirmed, lang),
    prepaid: say(ROTA_COPY.statePrepaid, lang),
    pending: say(ROTA_COPY.statePending, lang),
    moved: say(ROTA_COPY.stateMoved, lang),
  };

  function save() {
    if (name.trim() === '') {
      flash.problem(say(ROTA_COPY.needGuestName, lang));

      return;
    }

    /* Nine digits, which is a full Uzbek subscriber number. A booking with no
       way to reach the guest is a table held for nobody. */
    if (phone.replace(/\D/g, '').length < 9) {
      flash.problem(say(ROTA_COPY.needPhone, lang));

      return;
    }

    const seats = guests.trim() === '' ? '2' : guests.trim();
    const at = time.trim() === '' ? '19:00' : time.trim();
    const startsAt = bookingStartsAt(at, new Date());

    /*
     * Checked here rather than only on the way back, and with the same message
     * the move dialog uses. `starts_at` is a timestamp upstream, so `7pm` comes
     * back as a validation error about a field this form does not have — and
     * the line would already be in the diary by then.
     */
    if (startsAt === null) {
      flash.problem(say(ROTA_COPY.needTime, lang));

      return;
    }

    /*
     * The table is a wish, not an assignment.
     *
     * `restaurant_table_id` is a numeric id and this field is a label — and
     * labels repeat across halls, so `12` names one table in the main room and
     * another upstairs. Sending a guess would file the booking against the
     * wrong room. It travels in the note, which is where a host reads it, and
     * the booking stays unassigned: `pending` holds no table by design.
     */
    const wanted = table.trim() === '' ? '' : `${say(ROTA_COPY.table, lang)} ${table.trim()}`;

    const wish = [wanted, note.trim()].filter((part) => part !== '').join(' · ');

    /*
     * A local key, not an id. It never goes upstream — `apiId()` reads it as
     * "not a live row" because it does not start with a digit — and it exists
     * only so the line can be found again if the API refuses. Indexing by
     * position would have been enough until a refusal removed one and every
     * later row shifted onto somebody else's key.
     */
    const local = `n${Date.now()}`;

    setExtra((current) => [
      ...current,
      {
        id: local,
        time: at,
        who: `${name.trim()} · ${seats} ${say(ROTA_COPY.guests, lang)}`,
        detail: [wanted, phone.trim(), note.trim()].filter((part) => part !== '').join(' · '),
        state: 'pending',
      },
    ]);

    const booking = {
      guestName: name.trim(),
      guestPhone: phone.trim(),
      guests: Number.parseInt(seats, 10),
      startsAt,
      note: wish === '' ? null : wish,
    };

    setFormOpen(false);
    setTime('');
    setName('');
    setGuests('');
    setTable('');
    setPhone('');
    setNote('');

    /*
     * The line appears immediately and is **taken back** if the API refuses.
     *
     * That is the opposite of the swap queue two components up, and the
     * difference is what the row means. A verdict is a decision about a request
     * that exists either way, so it settles and stays settled. A booking the
     * server rejected does not exist — and a phantom line in tonight's diary is
     * the worst outcome this screen has: a host expecting four people who were
     * never written down, or a table held against nothing.
     */
    void post('/api/tables/reservations', booking, lang).then((answer) => {
      if (answer.ok) {
        flash(say(ROTA_COPY.bookingAdded, lang));

        return;
      }

      setExtra((current) => current.filter((row) => row.id !== local));
      flash.problem(answer.message ?? problem('generic'));
    });
  }

  /**
   * A booking called off, on the server.
   *
   * The × used to grey the row out in local state and flash "booking dropped".
   * The booking stayed live: it came back on the next render, the guest still
   * arrived, and the table stayed held on every other screen.
   *
   * Greyed first and put back on a refusal, which is the opposite of the add
   * form above and right for the same reason it is wrong there: a row that
   * vanished and came back is a host looking twice, while a row that stayed
   * gone after a refused cancel is a table nobody holds.
   */
  async function drop(row: Row): Promise<void> {
    const id = apiId(row.id);

    // A fixture row. It still greys out, because that is what the demo is for.
    if (id === null) {
      setDropped((current) => [...current, row.id]);
      flash(say(ROTA_COPY.bookingDropped, lang));

      return;
    }

    setDropped((current) => [...current, row.id]);

    const answer = await post('/api/tables/reservations/cancel', { id }, lang);

    if (answer.ok) {
      flash(say(ROTA_COPY.bookingDropped, lang));
      router.refresh();

      return;
    }

    setDropped((current) => current.filter((dropId) => dropId !== row.id));
    flash.problem(answer.message ?? problem('generic'));
  }

  /**
   * A booking moved, on the server.
   *
   * Same fault as the × beside it: the new time went into local state and was
   * flashed, and the kitchen, the floor plan and the host at the door all still
   * had the old one.
   *
   * The table is deliberately not sent. This sheet takes a LABEL — `12`,
   * `VIP-3` — and labels are not unique across halls, so filing one as an id
   * would move the party into another room. It rides in the row's own line
   * where a host reads it, exactly as the add form does.
   */
  async function confirmMove() {
    if (moving === null) return;

    const startsAt = bookingStartsAt(newTime, new Date());

    if (startsAt === null) {
      flash.problem(say(ROTA_COPY.needTime, lang));

      return;
    }

    const id = apiId(moving.id);
    const row = moving;

    setMoved((state) => ({
      ...state,
      [row.id]: { time: newTime.trim(), table: newTable.trim() },
    }));
    setMoving(null);

    if (id === null) {
      flash(`${newTime.trim()} ${say(ROTA_COPY.bookingMovedTo, lang)}`);

      return;
    }

    const answer = await post('/api/tables/reservations/move', { id, startsAt }, lang);

    if (answer.ok) {
      flash(`${newTime.trim()} ${say(ROTA_COPY.bookingMovedTo, lang)}`);
      router.refresh();

      return;
    }

    setMoved((state) => {
      const next = { ...state };
      delete next[row.id];

      return next;
    });
    flash.problem(answer.message ?? problem('generic'));
  }

  return (
    <>
      <section className="bg-surface overflow-hidden rounded-lg border">
        <div className="border-divider flex items-baseline justify-between gap-3 border-b px-5 pt-4 pb-3.5">
          <h3 className="text-md tracking-snug font-semibold">{say(ROTA_COPY.bookings, lang)}</h3>

          <div className="flex items-center gap-3">
            <span data-num className="text-fg-subtle text-xs">
              {rows.length} {say(ROTA_COPY.bookingsCount, lang)}
            </span>
            <button
              type="button"
              data-press
              onClick={() => setFormOpen((value) => !value)}
              className="bg-brand-500 hover:bg-brand-600 h-7 rounded-md px-2.5 text-xs font-semibold text-white"
            >
              {say(ROTA_COPY.bookingAdd, lang)}
            </button>
          </div>
        </div>

        {formOpen ? (
          <div className="bg-bg-subtle border-divider border-b px-5 py-3.5">
            <div className="grid [grid-template-columns:76px_minmax(0,1fr)_62px_76px] gap-2">
              <Field value={time} onChange={setTime} placeholder="19:00" />
              <Field value={name} onChange={setName} placeholder={say(ROTA_COPY.phName, lang)} />
              <Field value={guests} onChange={setGuests} placeholder="4" />
              <Field value={table} onChange={setTable} placeholder={say(ROTA_COPY.phTable, lang)} />
            </div>

            <div className="mt-2 grid [grid-template-columns:190px_minmax(0,1fr)] gap-2">
              <Field value={phone} onChange={setPhone} placeholder="+998 90 123 45 67" mono />
              <Field value={note} onChange={setNote} placeholder={say(ROTA_COPY.phNote, lang)} />
            </div>

            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                data-press
                onClick={save}
                className="bg-brand-500 hover:bg-brand-600 h-8 rounded-md px-3.5 text-sm font-semibold text-white"
              >
                {say(ROTA_COPY.bookingSave, lang)}
              </button>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="border-border-strong text-fg-muted hover:bg-bg-muted h-8 rounded-md border px-3.5 text-sm font-medium"
              >
                {say(ROTA_COPY.bookingCancelBtn, lang)}
              </button>
            </div>
          </div>
        ) : null}

        {rows.map((row) => (
          <div key={row.id} className="border-divider flex items-center gap-3.5 border-b px-5 py-3">
            <span data-num className="font-display text-md w-[46px] flex-none font-semibold">
              {row.time}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{row.who}</span>
              <span data-num className="text-fg-subtle mt-0.5 block text-xs">
                {row.detail}
              </span>
            </span>

            <span
              className={`rounded-pill text-2xs flex-none px-2.5 py-1 font-semibold ${STATE_CHIP[row.state]}`}
            >
              {label[row.state]}
            </span>

            <button
              type="button"
              onClick={() => {
                setMoving(row);
                setNewTime(row.time);
                setNewTable('');
              }}
              title={say(ROTA_COPY.bookingMove, lang)}
              aria-label={say(ROTA_COPY.bookingMove, lang)}
              className="text-fg-disabled hover:bg-bg-muted hover:text-fg grid size-[26px] flex-none place-items-center rounded-sm"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 8v4.5l3 1.8" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => void drop(row)}
              title={say(ROTA_COPY.bookingDrop, lang)}
              aria-label={say(ROTA_COPY.bookingDrop, lang)}
              className="text-fg-disabled hover:bg-danger-50 hover:text-danger-600 grid size-[26px] flex-none place-items-center rounded-sm"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </section>

      {moving === null ? null : (
        <Modal onClose={() => setMoving(null)} title={say(ROTA_COPY.bookingMove, lang)} width={440}>
          <p className="text-fg-muted mt-2 text-sm leading-relaxed">{moving.who}</p>

          <div className="mt-[18px] grid [grid-template-columns:120px_minmax(0,1fr)] gap-3">
            <label className="block">
              <span className="text-fg-muted block text-xs font-semibold">
                {say(ROTA_COPY.bookingNewTime, lang)}
              </span>
              <input
                value={newTime}
                onChange={(event) => setNewTime(event.target.value)}
                placeholder="20:30"
                className="bg-surface border-border-strong font-display text-md mt-2 h-[42px] w-full rounded-md border px-3 font-semibold"
              />
            </label>

            <label className="block">
              <span className="text-fg-muted block text-xs font-semibold">
                {say(ROTA_COPY.bookingNewTable, lang)}
              </span>
              <input
                value={newTable}
                onChange={(event) => setNewTable(event.target.value)}
                placeholder={say(ROTA_COPY.phTable, lang)}
                className="bg-surface border-border-strong mt-2 h-[42px] w-full rounded-md border px-3 text-sm"
              />
            </label>
          </div>

          <div className="border-brand-500/20 bg-brand-50 mt-4 flex items-start gap-2.5 rounded-md border px-3.5 py-3">
            <span className="bg-brand-500 mt-1.5 size-[7px] flex-none rounded-full" />
            <span className="text-brand-700 text-sm leading-relaxed font-medium">
              {say(ROTA_COPY.bookingSms, lang)}
            </span>
          </div>

          <div className="border-divider mt-[22px] flex justify-end gap-2.5 border-t pt-[18px]">
            <button
              type="button"
              onClick={() => setMoving(null)}
              className="bg-surface border-border-strong hover:bg-bg-subtle h-[42px] rounded-md border px-4 text-sm font-semibold"
            >
              {say(ROTA_COPY.cancel, lang)}
            </button>
            <button
              type="button"
              data-press
              onClick={() => void confirmMove()}
              className="bg-brand-500 hover:bg-brand-600 h-[42px] rounded-md px-[18px] text-sm font-semibold text-white"
            >
              {say(ROTA_COPY.bookingMoveDo, lang)}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* -------------------------------------------------------------- checklist */

export function OpeningChecklist({
  lang,
  checklist,
}: {
  lang: Lang;
  /**
   * Today's ticks from the server, and whether they came from one.
   *
   * `live: false` is the demo console — no session, or a reader without
   * `staff.view` — and the boxes then tick locally and the panel says out loud
   * that nothing is recorded, which is what it used to say about every console.
   */
  checklist: OpeningChecklistData;
}) {
  /*
   * The server's ticks are the starting state; a press updates them here first.
   *
   * Optimistic on purpose. A tick box that waits for a round trip before it
   * fills is a tick box somebody presses twice, and the second press is an
   * un-tick — so the one thing a slow morning must not do is undo the work.
   * A refusal puts the box back and says why.
   */
  const [done, setDone] = useState<readonly string[]>(
    checklist.items.filter((item) => item.done).map((item) => item.item),
  );

  /** Who ticked what, from the server. Empty for anything ticked this session:
   *  the API attributes the press and the panel does not learn the name back
   *  until the next render, and a name invented in the meantime would be the
   *  one made-up thing on a panel that has stopped making things up. */
  const by = new Map(checklist.items.map((item) => [item.item, item.by]));

  async function toggle(item: string, next: boolean) {
    setDone((current) => (next ? [...current, item] : current.filter((id) => id !== item)));

    if (!checklist.live) return;

    const answer = await post(
      '/api/staff/checklist',
      { day: checklist.day, item, done: next },
      lang,
    );

    if (answer.ok) return;

    // Put it back. A box that stayed ticked after the server refused would be
    // the exact false trail this table was added to stop.
    setDone((current) => (next ? current.filter((id) => id !== item) : [...current, item]));
    flash.problem(answer.message ?? say(ROTA_COPY.checklistFailed, lang));
  }

  return (
    <section className="bg-surface overflow-hidden rounded-lg border">
      <div className="border-divider border-b px-5 pt-4 pb-3.5">
        <h3 className="text-md tracking-snug font-semibold">{say(ROTA_COPY.checklist, lang)}</h3>
        <p data-num className="text-fg-subtle mt-1 text-xs">
          {done.length} / {OPENING_CHECKLIST.length} {say(ROTA_COPY.checklistDone, lang)}
        </p>
        {/*
          Only when nothing is being recorded. The line used to stand on every
          console, because nothing ever was; now it is the demo's caption and a
          live restaurant gets its ticks written to `staff.opening_checklist_ticks`
          with the name of whoever pressed them.
        */}
        {checklist.live ? null : (
          <p className="text-fg-subtle mt-1.5 text-xs leading-normal">
            {say(ROTA_COPY.checklistTemplate, lang)}
          </p>
        )}
      </div>

      {OPENING_CHECKLIST.map((item) => {
        const ticked = done.includes(item.id);
        const who = by.get(item.id) ?? null;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => void toggle(item.id, !ticked)}
            className="border-divider hover:bg-bg-subtle flex w-full items-center gap-3 border-b bg-transparent px-5 py-3 text-left"
          >
            <span
              className={`grid size-[19px] flex-none place-items-center rounded-[5px] border-[1.5px] ${
                ticked ? 'bg-brand-500 border-brand-500' : 'border-border-strong'
              }`}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="3.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ opacity: ticked ? 1 : 0 }}
                aria-hidden
              >
                <path d="m5 12.5 4.5 4.5L19 7" />
              </svg>
            </span>

            <span
              className={`min-w-0 flex-1 text-sm ${ticked ? 'text-fg-subtle line-through' : ''}`}
            >
              {say(item.label, lang)}
            </span>

            {/* Who ticked it, when the server knows. The design prints a time
                beside the name; the API sends the name and the timestamp, and
                only the name is drawn here because a time formatted in a client
                component is a hydration mismatch waiting for a Node and a
                browser to disagree about a locale. */}
            {who === null ? null : <span className="text-fg-subtle flex-none text-xs">{who}</span>}
          </button>
        );
      })}
    </section>
  );
}

/* ----------------------------------------------------------------- pieces */

function Field({
  value,
  onChange,
  placeholder,
  mono,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  mono?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className={`bg-surface border-border-strong h-[34px] w-full rounded-md border px-2.5 text-sm ${mono ? 'font-mono' : ''}`}
    />
  );
}

/** The design's centred dialog: a scrim, a card, and nothing behind it reachable. */
function Modal({
  title,
  width,
  onClose,
  children,
}: {
  title: string;
  width: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      data-scrim
      className="fixed inset-0 z-[200] grid place-items-center p-4"
      style={{ background: 'rgba(15,19,32,.4)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        data-sheet
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="bg-surface max-h-[calc(100dvh-64px)] w-full overflow-y-auto rounded-xl border p-[26px] shadow-xl"
        style={{ maxWidth: width }}
      >
        <h3 className="font-display text-xl font-bold tracking-tight">{title}</h3>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------- asking for a swap */

/**
 * "Can somebody take this shift?"
 *
 * One select and one sentence, because that is the whole request: the API takes
 * a shift id and an optional reason, and the person who will cover it is chosen
 * by the manager at approval — most requests are open ("can anybody take
 * Thursday") and naming a colleague in the form would make the common case the
 * awkward one.
 *
 * The row is not added to the queue below optimistically. That queue is the
 * MANAGER's — pending requests waiting on a verdict — and a request somebody
 * has just raised appears there on the next render with its real id; faking one
 * would put a row on screen the approve button could not address.
 */
function SwapRequest({ shifts, lang }: { shifts: readonly SwappableShift[]; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const [shiftId, setShiftId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function send() {
    const id = Number(shiftId);

    if (!Number.isInteger(id) || id <= 0) {
      flash.problem(say(ROTA_COPY.swapNeedShift, lang));

      return;
    }

    setBusy(true);
    const answer = await post('/api/staff/shift-swap', { shiftId: id, reason }, lang);
    setBusy(false);

    if (!answer.ok) {
      // `staff.swap_already_pending` and friends arrive with their own
      // sentence in the reader's language, which says more than "could not
      // send" — the commonest of them is a shift that already has a request
      // open on it.
      flash.problem(answer.message ?? say(ROTA_COPY.swapFailed, lang));

      return;
    }

    flash(say(ROTA_COPY.swapSent, lang));
    setOpen(false);
    setShiftId('');
    setReason('');
    // The queue below is a server read, and the new request belongs in it.
    router.refresh();
  }

  return (
    <div className="mb-3.5">
      <button
        type="button"
        data-press
        onClick={() => setOpen((current) => !current)}
        className="border-border-strong bg-surface text-fg h-[30px] rounded-md border px-3 text-xs font-semibold"
      >
        {say(open ? ROTA_COPY.swapAskClose : ROTA_COPY.swapAsk, lang)}
      </button>

      {open ? (
        shifts.length === 0 ? (
          <p className="bg-surface text-fg-subtle mt-2.5 rounded-lg border px-4 py-3 text-xs leading-normal">
            {say(ROTA_COPY.swapNoShifts, lang)}
          </p>
        ) : (
          <div className="bg-surface mt-2.5 flex flex-wrap items-end gap-2.5 rounded-lg border p-4">
            <label className="min-w-[220px] flex-1">
              <span className="text-fg-subtle mb-1 block text-xs">
                {say(ROTA_COPY.swapShift, lang)}
              </span>
              <select
                value={shiftId}
                onChange={(event) => setShiftId(event.target.value)}
                className="border-border-strong bg-bg-subtle h-9 w-full rounded-md border px-2.5 text-sm"
              >
                <option value="">—</option>
                {shifts.map((shift) => (
                  <option key={shift.id} value={shift.id}>
                    {shift.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-[220px] flex-[2]">
              <span className="text-fg-subtle mb-1 block text-xs">
                {say(ROTA_COPY.swapReason, lang)}
              </span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="border-border-strong bg-bg-subtle h-9 w-full rounded-md border px-2.5 text-sm"
              />
            </label>

            <button
              type="button"
              data-press
              disabled={busy}
              onClick={() => void send()}
              className="bg-brand-500 hover:bg-brand-600 h-9 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-45"
            >
              {busy ? say(ROTA_COPY.swapSending, lang) : say(ROTA_COPY.swapSend, lang)}
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}
