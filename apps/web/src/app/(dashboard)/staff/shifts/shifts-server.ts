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
