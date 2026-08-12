import { apiGet, type Paginated } from '@/lib/api-server';

import { STAFF, type StaffRow } from './staff-data';

/**
 * The roster, from the API.
 *
 * Eight columns and not one of them needed a new database column, which is
 * worth saying because the first read of this screen suggested otherwise. Every
 * figure falls out of records that already exist:
 *
 * - **Today's shift** is the shift rostered for today.
 * - **Clocked in** is an attendance opened and not yet closed. Not the
 *   employment status — `active` means "works here", and reading it as "is here
 *   now" would show the whole payroll standing in the kitchen at 3am.
 * - **Hours this week** is the attendance minutes, summed.
 * - **Sales and tickets** are the orders this person took.
 *
 * Server-only: `@/lib/api-server` reads `next/headers`.
 */
export type StaffScreenRow = Omit<StaffRow, 'role'> & { roleLabel: string };

type ApiMember = {
  id: number;
  full_name: string;
  position: string;
  status: string;
  user_id: number | null;
};

type ApiShift = { staff_member_id: number; starts_at: string; ends_at: string; status: string };

type ApiAttendance = {
  staff_member_id: number;
  checked_in_at: string;
  checked_out_at: string | null;
  minutes_worked: number | null;
};

type ApiOrder = { waiter_user_id: number | null; total: number; status: string };

/** The design's six named posts against the platform's position codes. */
const ROLE_KEYS: Readonly<Record<string, StaffRow['role']>> = {
  chef: 'roleHeadChef',
  cook: 'roleKitchen',
  waiter: 'roleWaiter',
  cashier: 'roleCashier',
  storekeeper: 'roleStore',
  host: 'roleShiftManager',
};

/** `08:00`–`20:00` → `08–20`, as the design's column reads it. */
const span = (shift: ApiShift): string =>
  `${shift.starts_at.slice(11, 13)}–${shift.ends_at.slice(11, 13)}`;

const isToday = (iso: string): boolean =>
  iso.slice(0, 10) === new Date().toISOString().slice(0, 10);

export async function getStaff(
  t: (key: string) => string,
  em = '—',
): Promise<readonly StaffScreenRow[]> {
  const [members, shifts, attendances, orders] = await Promise.all([
    apiGet<Paginated<ApiMember>>('/staff/members?per_page=100'),
    apiGet<Paginated<ApiShift>>('/staff/shifts?per_page=300'),
    apiGet<Paginated<ApiAttendance>>('/staff/attendances?per_page=300'),
    apiGet<Paginated<ApiOrder>>('/orders/orders?per_page=200'),
  ]);

  if (!members?.data) {
    return STAFF.map((person) => ({ ...person, roleLabel: t(person.role) }));
  }

  const today = new Map<number, string>();

  for (const shift of shifts?.data ?? []) {
    if (shift.status !== 'cancelled' && isToday(shift.starts_at)) {
      today.set(shift.staff_member_id, span(shift));
    }
  }

  const worked = new Map<number, { minutes: number; open: boolean }>();

  for (const attendance of attendances?.data ?? []) {
    const entry = worked.get(attendance.staff_member_id) ?? { minutes: 0, open: false };

    entry.minutes += attendance.minutes_worked ?? 0;
    // Checked in and never checked out — the only honest reading of "is here".
    if (attendance.checked_out_at === null) entry.open = true;

    worked.set(attendance.staff_member_id, entry);
  }

  /** Sales per user id, since an order names the waiter's user, not their staff record. */
  const sold = new Map<number, { total: number; count: number }>();

  for (const order of orders?.data ?? []) {
    const id = order.waiter_user_id;

    if (id === null || order.status === 'cancelled') continue;

    const entry = sold.get(id) ?? { total: 0, count: 0 };
    entry.total += order.total;
    entry.count += 1;
    sold.set(id, entry);
  }

  return members.data
    .filter((member) => member.status === 'active')
    .map((member) => {
      const attendance = worked.get(member.id);
      const sales = member.user_id === null ? undefined : sold.get(member.user_id);

      return {
        id: String(member.id),
        name: member.full_name,
        roleLabel: t(ROLE_KEYS[member.position] ?? 'roleWaiter'),
        shift: today.get(member.id) ?? em,
        clockedIn: attendance?.open ?? false,
        hours: Math.round((attendance?.minutes ?? 0) / 60),
        // Zero, not an em dash: a chef genuinely sells nothing, and a blank
        // would read as "unknown" rather than "not their job".
        sales: sales?.total ?? 0,
        tickets: sales?.count ?? 0,
      };
    });
}
