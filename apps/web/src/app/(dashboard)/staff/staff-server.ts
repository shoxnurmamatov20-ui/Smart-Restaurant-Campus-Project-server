import { writtenClock } from '@restaurant/surfaces/time/written';

import { apiGet, type Paginated } from '@/lib/api-server';

import { POSITIONS, STAFF, type StaffRow } from './staff-data';

/**
 * The roster, from the API.
 *
 * Server half of ./staff-data.ts — the split every screen follows: types and
 * fixtures in `*-data.ts`, server calls in a sibling only server components
 * import. See tables-server.ts for why.
 *
 * Four calls rather than one per row. The members endpoint knows who works here
 * and nothing about today: which shift they are on lives in the rota, whether
 * they are standing in the building lives in attendance, and what they sold
 * lives in Orders. Four list requests resolve every row at once; a request per
 * person would be seven on this page and eighty on a chain's.
 *
 * ---------------------------------------------------------------------------
 * Why Orders is a fourth request and not a wider `members` payload
 *
 * Staff does not import Orders — modules reach each other only through
 * `App\Contracts\*`, and there is no contract for "what did this person sell",
 * because a roster has no business asking. So the join happens *here*: the
 * frontend is the one place that legitimately reads both modules, and it costs
 * one request rather than a new coupling between two schemas.
 *
 * The join is on **user id**, and that is the trap in this file. `ApiMember` is
 * keyed by staff-member id — a row in `staff.members` — while the aggregate is
 * keyed by the user who signed in and took the order. They are different
 * numbers for the same person, and matching them by position or by name would
 * quietly credit one waiter with another's takings.
 */

/** `GET /api/v1/staff/members`, narrowed to what this screen draws. */
type ApiMember = {
  id: number;
  /*
   * The account this person signs in with, and the only key the sales aggregate
   * below can be joined on. Optional because somebody on the roster may have no
   * login at all — a kitchen porter who never touches a till — and `null` for
   * exactly those people rather than 0.
   */
  user_id?: number | null;
  full_name: string;
  position: string;
  status: string;
  /** Derived by the API from the rota and the attendance records. */
  attendance_rate?: number | null;
  last_shift_at?: string | null;
  has_pin?: boolean;
};

/** `GET /api/v1/staff/shifts` — today's rota, for the "shift" column. */
type ApiShift = {
  staff_member_id: number;
  starts_at: string;
  ends_at: string;
  status: string;
};

/** `GET /api/v1/staff/attendances` — who is in the building, and for how long. */
type ApiAttendance = {
  staff_member_id: number;
  checked_in_at: string;
  checked_out_at: string | null;
  minutes_worked: number;
};

/**
 * `GET /api/v1/orders/stats/by-waiter` — what each person actually sold.
 *
 * Keyed by the user who took the order, not by the roster row. Only people who
 * sold something appear at all, which is why the join below defaults to zero
 * rather than treating an absent row as an error: a chef is absent from this
 * list every day of their career.
 */
type ApiSales = {
  waiter_user_id: number;
  tickets: number;
  covers: number;
  revenue_tiyin: number;
  average_tiyin: number;
};

/**
 * The nine posts the server records against the labels this screen has.
 *
 * A map rather than string arithmetic: the catalogue keys are typed, and
 * building one at runtime would compile happily and print `staff.roleSommelier`
 * the first time somebody hired one.
 */
export const ROLE: Readonly<Record<string, StaffRow['role']>> = Object.fromEntries(
  POSITIONS.map((position) => [position.value, position.label]),
);

/**
 * `2026-08-22T10:00:00+05:00` → `10:00`, which is how the column reads.
 *
 * As written, never as the rendering machine reads it. The stamp carries the
 * venue's own offset because that is the fact — ten hundred, in that room — and
 * `new Date(iso).getHours()` re-expresses it in whatever zone the renderer sits
 * in. A bartender rostered 18:00–02:00 then draws as 13:00–21:00 on a UTC box,
 * which is a shift nobody was ever put on; the finish also crosses back over
 * midnight, so the row claims a night that ended the day before it started.
 */
const clock = (iso: string): string => writtenClock(iso);

/**
 * The roster for this render — the API's when there is a session.
 *
 * Terminated people are left out. Their attendance and payroll history stays in
 * the tables, which is what a labour inspection asks for; the screen is a list
 * of who works here now, and a manager scrolling past three leavers to find a
 * waiter is a screen that gets worse every year.
 */
export async function getRoster(now: Date = new Date()): Promise<readonly StaffRow[]> {
  const [members, shifts, attendances, sales] = await Promise.all([
    apiGet<Paginated<ApiMember>>('/staff/members?per_page=100'),
    // The published week either side of today. Narrowed here rather than asked
    // for as "today", because the venue's trading day runs past midnight and
    // only the API knows where that boundary falls.
    apiGet<Paginated<ApiShift>>(
      `/staff/shifts?per_page=300&filter[published]=1&filter[from]=${isoDay(now, -1)}&filter[to]=${isoDay(now, 1)}`,
    ),
    apiGet<Paginated<ApiAttendance>>('/staff/attendances?per_page=300&sort=-checked_in_at'),
    /*
     * A week, to match the `hours` column beside it. The two figures sit in the
     * same row and a manager reads them together — "38 hours, 6.2 million" — so
     * a day's takings against a week's hours would be a sentence that does not
     * parse.
     */
    apiGet<{ data?: ApiSales[] }>('/orders/stats/by-waiter?period=week'),
  ]);

  if (!members?.data) return STAFF;

  const today = todayShiftByMember(shifts?.data ?? [], now);
  const open = openByMember(attendances?.data ?? []);
  const weekly = minutesThisWeek(attendances?.data ?? [], now);
  const sold = new Map((sales?.data ?? []).map((row) => [row.waiter_user_id, row]));

  return members.data
    .filter((member) => member.status !== 'terminated')
    .map((member): StaffRow => {
      const shift = today.get(member.id);
      // `?? -1` rather than a nullish chain: a member with no login must miss
      // the map, and `undefined` as a key would match a row keyed `undefined`
      // if the API ever sent one.
      const takings = sold.get(member.user_id ?? -1);

      return {
        id: String(member.id),
        ...(typeof member.user_id === 'number' ? { userId: member.user_id } : {}),
        position: member.position,
        name: member.full_name,
        // A post the console has no word for is drawn as kitchen rather than
        // left blank: an empty cell in a role column reads as a broken row.
        role: ROLE[member.position] ?? 'roleKitchen',
        // An em dash rather than a guess: somebody with no shift today is not
        // working 09:00–18:00, they are off.
        shift: shift === undefined ? '—' : `${clock(shift.starts_at)} – ${clock(shift.ends_at)}`,
        clockedIn: open.has(member.id),
        hours: Math.round((weekly.get(member.id) ?? 0) / 60),
        /*
         * Sales and tickets come from Orders, joined on the user id above.
         * Anybody the aggregate does not mention keeps zero — a chef sells
         * nothing and never appears in it — and the screen already draws zero
         * as an em dash rather than as "0 so'm", which beside a kitchen hand's
         * name would read as a performance figure.
         */
        sales: takings?.revenue_tiyin ?? 0,
        tickets: takings?.tickets ?? 0,
      };
    });
}

/** `YYYY-MM-DD`, so many days from the given moment. */
function isoDay(now: Date, offset: number): string {
  const at = new Date(now);
  at.setDate(at.getDate() + offset);

  return [
    at.getFullYear(),
    String(at.getMonth() + 1).padStart(2, '0'),
    String(at.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * The shift each person is on today.
 *
 * "Today" is the calendar day here, and it can disagree with the API's trading
 * day for a bartender rostered 14:00–00:00 — their shift is drawn on the day it
 * starts, which is also how the design's column reads it. The window asked for
 * above is deliberately a day either side so the row is found whichever side of
 * midnight the render happens on.
 */
function todayShiftByMember(shifts: readonly ApiShift[], now: Date): Map<number, ApiShift> {
  const day = isoDay(now, 0);
  const byMember = new Map<number, ApiShift>();

  for (const shift of shifts) {
    if (shift.status === 'cancelled') continue;
    if (shift.starts_at.slice(0, 10) !== day) continue;

    // Earliest first: somebody on a split shift is shown the one they start
    // with, because that is the one a manager is asking about at nine.
    const held = byMember.get(shift.staff_member_id);

    if (held === undefined || shift.starts_at < held.starts_at) {
      byMember.set(shift.staff_member_id, shift);
    }
  }

  return byMember;
}

/** Who is in the building: an attendance record that has not been closed. */
function openByMember(attendances: readonly ApiAttendance[]): Set<number> {
  return new Set(
    attendances.filter((row) => row.checked_out_at === null).map((row) => row.staff_member_id),
  );
}

/**
 * Minutes worked in the last seven days, per person.
 *
 * The closed records carry their own frozen figure — an hourly rate that
 * changes next month must not rewrite what somebody earned last month — and the
 * open one is counted up to now, so the column moves during a shift rather than
 * jumping when it ends.
 */
function minutesThisWeek(attendances: readonly ApiAttendance[], now: Date): Map<number, number> {
  const from = new Date(now);
  from.setDate(from.getDate() - 7);

  const byMember = new Map<number, number>();

  for (const row of attendances) {
    const startedAt = Date.parse(row.checked_in_at);

    if (Number.isNaN(startedAt) || startedAt < from.getTime()) continue;

    const minutes =
      row.checked_out_at === null
        ? Math.max(0, Math.round((now.getTime() - startedAt) / 60_000))
        : row.minutes_worked;

    byMember.set(row.staff_member_id, (byMember.get(row.staff_member_id) ?? 0) + minutes);
  }

  return byMember;
}

/**
 * What the line under the title can honestly say.
 *
 * The catalogue's sentence — "19 people in Chilonzor, 5 on shift, 2 gaps this
 * week" — is the design's mock, and it stood over a live, empty table on the
 * first real restaurant's first morning. The counts here come from the rows
 * the page is about to draw; `null` means the page is drawing the fixture,
 * and the design's own sentence is the honest caption for the design's own
 * data.
 */
export type RosterFacts = { place: string; people: number; onShift: number } | null;

export function rosterFacts(rows: readonly StaffRow[], place: string, live: boolean): RosterFacts {
  if (!live) return null;

  return {
    place,
    people: rows.length,
    onShift: rows.filter((person) => person.clockedIn).length,
  };
}

/** Whether `getRoster()` answered from the API rather than the fixture. */
export function rosterIsLive(rows: readonly StaffRow[]): boolean {
  return rows !== STAFF;
}
