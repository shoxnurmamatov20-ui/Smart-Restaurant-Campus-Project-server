import { type SwapRow } from './shifts-data';

import { apiGet, type Paginated } from '@/lib/api-server';

/**
 * The published week.
 *
 * A row per person, seven cells per row, `null` for a day off — the shape the
 * design's rota grid draws. Building it here rather than on the screen is the
 * point: the API answers with a flat list of shifts, one row per person per
 * day, and turning that into a grid is arithmetic, not presentation.
 *
 * Server-only, like every `*-server`-shaped module: `@/lib/api-server` reads
 * `next/headers`. Nothing in the browser bundle imports this.
 */

/** Monday-first, matching the catalogue's day headings. */
export type RotaRow = {
  id: string;
  /** A person's name is theirs; it is not translated. */
  name: string;
  /** Their post, as the server records it — `waiter`, `chef`, `cashier`. */
  role: string;
  /** Seven cells, Monday to Sunday. `null` is a day off. */
  days: readonly (string | null)[];
};

type ApiShift = {
  staff_member_id: number;
  starts_at: string;
  ends_at: string;
  role: string;
  status: string;
};

type ApiMember = { id: number; full_name: string; position: string; status: string };

/** `08:00` → `08`, which is how the design's cell reads: `08–20`. */
const hour = (iso: string): string => iso.slice(11, 13);

/**
 * Monday-first index for an ISO date.
 *
 * `getUTCDay()` is Sunday-first and the rota is not; a rota that started on
 * Sunday would put every shift in the wrong column and look almost right,
 * which is the worst kind of wrong.
 */
function weekday(iso: string): number {
  const day = new Date(iso).getUTCDay();

  return (day + 6) % 7;
}

/**
 * The rota for this render, or `null` when there is no session.
 *
 * `null` rather than a fallback: the fixture rota lives on the screen, keyed by
 * fixture ids, and moving it here would mean maintaining the same seven people
 * in two shapes. The screen keeps its own and asks this first.
 */
export async function getRota(): Promise<readonly RotaRow[] | null> {
  const [shifts, members] = await Promise.all([
    // A fortnight's worth: the seeded week is three days either side of today,
    // and a manager published two weeks out would still fit.
    apiGet<Paginated<ApiShift>>('/staff/shifts?per_page=300'),
    apiGet<Paginated<ApiMember>>('/staff/members?per_page=100'),
  ]);

  if (!shifts?.data || !members?.data) return null;

  const week = new Map<number, (string | null)[]>();

  for (const shift of shifts.data) {
    // A cancelled shift is not on the rota. It stays in the table because the
    // manager who cancelled it is answerable for it; it is not work anyone is
    // expected to turn up for.
    if (shift.status === 'cancelled') continue;

    const row = week.get(shift.staff_member_id) ?? Array.from({ length: 7 }, () => null);
    row[weekday(shift.starts_at)] = `${hour(shift.starts_at)}–${hour(shift.ends_at)}`;
    week.set(shift.staff_member_id, row);
  }

  return members.data
    .filter((member) => member.status === 'active' && week.has(member.id))
    .map((member) => ({
      id: String(member.id),
      name: member.full_name,
      role: member.position,
      days: week.get(member.id) ?? [],
    }));
}

/* ------------------------------------------------------------------ swaps */

/** `GET /api/v1/staff/shift-swaps?filter[status]=pending`. */
type ApiSwap = {
  id: number;
  status: string;
  reason: string | null;
  shift?: { id: number; starts_at: string | null } | null;
  requested_by?: { id: number; full_name: string } | null;
  offered_to?: { id: number; full_name: string } | null;
};

/**
 * The requests still waiting on a manager.
 *
 * `null` rather than a fallback, like `getRota()` above and for the same
 * reason: the screen keeps its own fixture queue keyed by fixture names, and
 * maintaining the same three requests in two shapes is how they come to
 * disagree.
 *
 * Only the pending ones. A decided request is history and belongs in an audit
 * view; a queue that also listed last month's refusals would be a queue nobody
 * reaches the bottom of.
 */
export async function getSwaps(days: readonly string[]): Promise<readonly SwapRow[] | null> {
  const swaps = await apiGet<Paginated<ApiSwap>>(
    '/staff/shift-swaps?per_page=50&filter[status]=pending&include=shift,requestedBy,offeredTo',
  );

  if (!swaps?.data) return null;

  return swaps.data.map((swap): SwapRow => {
    const startsAt = swap.shift?.starts_at ?? null;

    return {
      id: String(swap.id),
      from: swap.requested_by?.full_name ?? '—',
      // An open request has nobody on the other side yet, and that is the
      // common case: somebody posts the shift to whoever will take it. The
      // manager is who decides, so the column says "nobody yet" rather than
      // inventing a name.
      to: swap.offered_to?.full_name ?? '—',
      day: startsAt === null ? '—' : (days[weekday(startsAt)] ?? '—'),
      reason: swap.reason ?? '',
    };
  });
}

/* ============================================================
   Tonight's diary
   ============================================================ */

/** `GET /api/v1/tables/reservations`, narrowed to what the diary draws. */
type ApiReservation = {
  id: number;
  guest_name: string | null;
  guest_phone: string | null;
  guests_count: number;
  starts_at: string | null;
  status: string;
  note: string | null;
  table?: { id: number | null; label?: string | null } | null;
};

/** One line of the diary, in the shape the panel already renders. */
export type BookingRow = {
  /** The reservation's row id as a string — `apiId()` on the panel reads it
   *  back, which is the same trick every other live/fixture pair here uses. */
  id: string;
  time: string;
  who: string;
  detail: string;
  state: 'confirmed' | 'prepaid' | 'pending' | 'moved';
};

/**
 * The API's reservation states against the four chips this panel has.
 *
 * `seated`, `completed` and `no_show` are not on the list at all — the diary is
 * what is still to come tonight, and a party already at their table is the
 * floor screen's business.
 */
const BOOKING_STATE: Readonly<Record<string, BookingRow['state']>> = {
  pending: 'pending',
  confirmed: 'confirmed',
};

/**
 * Tonight's bookings, or null when there is no session.
 *
 * The panel used to build its rows from `BOOKINGS` with no fetch at all, so a
 * restaurant with an empty diary was shown guest names, party sizes and table
 * numbers belonging to the demo — and the floor screen's "Reservations" button
 * sent the host straight here to plan the evening against them.
 *
 * The same call `tables-server.ts` makes for the floor plan: today, sorted by
 * start time. `null` rather than a fallback, like `getRota()` and `getSwaps()`
 * above — the panel keeps its own fixture diary and asks this first.
 *
 * `guests` is a parameter rather than a catalogue lookup because this file is
 * server-only and the caller already holds the reader's language.
 */
export async function getBookings(
  words: { guests: string; table: string },
  now: Date = new Date(),
): Promise<readonly BookingRow[] | null> {
  const bookings = await apiGet<Paginated<ApiReservation>>(
    `/tables/reservations?per_page=100&sort=starts_at&filter[day]=${isoDay(now)}`,
  );

  if (!bookings?.data) return null;

  return bookings.data
    .filter((booking) => BOOKING_STATE[booking.status] !== undefined)
    .map((booking): BookingRow => {
      const covers = `${booking.guests_count} ${words.guests}`;
      const table =
        booking.table?.label === null || booking.table?.label === undefined
          ? null
          : `${words.table} ${booking.table.label}`;

      return {
        id: String(booking.id),
        // `HH:MM`, zero-padded, because the panel sorts these as strings.
        time: booking.starts_at === null ? '—' : booking.starts_at.slice(11, 16),
        who: `${booking.guest_name ?? '—'} · ${covers}`,
        // The table when one is held, then whatever the host wrote down. An
        // unassigned booking says nothing rather than claiming a table: that is
        // what `pending` means and the chip beside it already says so.
        detail: [table, booking.note].filter((part) => part !== null && part !== '').join(' · '),
        state: BOOKING_STATE[booking.status] as BookingRow['state'],
      };
    });
}

/** `YYYY-MM-DD` in the reader's own day, which is the room's day. */
function isoDay(now: Date): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/* ============================================================
   The opening checklist

   Seven boxes a manager works down every morning, whose state lived in a
   browser tab: refresh the page and the morning never happened. That is worse
   than no checklist — a list that looks recorded is one people believe there is
   a trail of, and the whole reason a restaurant keeps one is the day somebody
   asks to see it.
   ============================================================ */

/** `GET /api/v1/staff/opening-checklist/{day}` → one row per declared item. */
type ApiChecklistItem = {
  item: string;
  done: boolean;
  /** The name as it read that morning, or null when nobody has ticked it. */
  by: string | null;
  at: string | null;
};

/** One line, in the shape the panel draws. */
export type ChecklistTick = { item: string; done: boolean; by: string | null };

export type OpeningChecklist = {
  /** `YYYY-MM-DD` — the day these ticks belong to, echoed by the API. */
  day: string;
  items: readonly ChecklistTick[];
  /** Whether the ticks came from the server. False is the demo console. */
  live: boolean;
};

/**
 * Today's list, or the demo's.
 *
 * `null` from the API — no session, a reader without `staff.view`, an API
 * mid-restart — leaves `live: false` and an empty tick list, and the panel then
 * keeps its own local boxes and says out loud that nothing is recorded. A live
 * answer with every box unticked is a real morning nobody has started, which is
 * a different thing and reads correctly without any special case.
 *
 * The day is a parameter rather than "today" resolved here, because the caller
 * is a server component that has already worked out the reader's date once for
 * the rest of the screen — and a second `new Date()` a millisecond either side
 * of midnight would ask for a different day than the one being drawn.
 */
export async function getOpeningChecklist(day: string): Promise<OpeningChecklist> {
  const answer = await apiGet<{ data?: readonly ApiChecklistItem[]; meta?: { day?: string } }>(
    `/staff/opening-checklist/${day}`,
  );

  if (!answer?.data) return { day, items: [], live: false };

  return {
    day: answer.meta?.day ?? day,
    items: answer.data.map((row) => ({ item: row.item, done: row.done, by: row.by })),
    live: true,
  };
}

/* ============================================================
   Which shift a swap is about

   The "request a swap" form on this screen used to collect a person and a
   WEEKDAY HEADING and post nothing — and the endpoint was not what was missing:
   `POST /v1/staff/shift-swaps` takes a shift id, one person on one day in one
   slot, and «Payshanba» names a different Thursday every week.

   So the form needs the ids the grid is already drawn from. This read is the
   same list `getRota()` walks, kept separate rather than folded into it because
   the grid wants a cell per person per day and the form wants a flat list of
   shifts that have not happened yet — and a function that returned both would
   be a function whose caller had to know which half it was using.
   ============================================================ */

/** One shift somebody can ask to be let off, as the picker offers it. */
export type SwappableShift = {
  id: number;
  /** `Aziza · 22.08 · 09–18` — a person, a date and a slot, which is what makes
   *  one Thursday different from the next. */
  label: string;
  startsAt: string;
};

/**
 * The published shifts still to come, or null when there is no session.
 *
 * Only what has not started. Asking to be let off a shift that finished on
 * Tuesday is not a request anybody can act on, and a picker offering it is a
 * picker whose first entry is always wrong.
 *
 * `now` is a parameter so the boundary is testable to the minute rather than
 * "roughly today" — the same reason `crew/live.ts` takes one.
 */
export async function getSwappableShifts(
  now: Date = new Date(),
): Promise<readonly SwappableShift[] | null> {
  const [shifts, members] = await Promise.all([
    apiGet<Paginated<ApiSwappableShift>>('/staff/shifts?per_page=300'),
    apiGet<Paginated<ApiMember>>('/staff/members?per_page=100'),
  ]);

  if (!shifts?.data || !members?.data) return null;

  const names = new Map(members.data.map((member) => [member.id, member.full_name]));

  return shifts.data
    .filter((shift) => shift.status !== 'cancelled' && Date.parse(shift.starts_at) > now.getTime())
    .sort((left, right) => left.starts_at.localeCompare(right.starts_at))
    .map((shift) => ({
      id: shift.id,
      startsAt: shift.starts_at,
      /*
       * Built from the ISO string by hand rather than through `Intl`.
       *
       * The label crosses into a client component, and Node and a browser
       * disagree about how they abbreviate a month — which is a hydration
       * mismatch, not a cosmetic difference. `22.08` reads the same in all
       * three languages and needs no catalogue.
       */
      label: [
        names.get(shift.staff_member_id) ?? '—',
        `${shift.starts_at.slice(8, 10)}.${shift.starts_at.slice(5, 7)}`,
        `${hour(shift.starts_at)}–${hour(shift.ends_at)}`,
      ].join(' · '),
    }));
}

/** `GET /api/v1/staff/shifts`, with the id the swap endpoint is addressed by. */
type ApiSwappableShift = {
  id: number;
  staff_member_id: number;
  starts_at: string;
  ends_at: string;
  status: string;
};
