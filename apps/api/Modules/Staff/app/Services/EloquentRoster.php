<?php

declare(strict_types=1);

namespace Modules\Staff\Services;

use App\Contracts\Staff\Roster;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Modules\Staff\Models\Attendance;
use Modules\Staff\Models\Shift;

/**
 * Who is at work right now, counted from attendance.
 *
 * An open attendance — checked in, not yet checked out — is the definition of
 * "on shift" everywhere else in the module, so it is the definition here too.
 * The rota (planned shifts) deliberately plays no part: the idle screen's
 * number answers "how many people are IN the building", and a shift that was
 * planned but not shown up for is exactly the difference this makes visible.
 */
final class EloquentRoster implements Roster
{
    public function onShiftCount(?int $branchId = null): int
    {
        return Attendance::query()
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->whereNull('checked_out_at')
            ->count();
    }

    /**
     * Hours worked × the rate on the person's record, in tiyin.
     *
     * One aggregate over the join, not a loop: the caller is a dashboard and a
     * chain has hundreds of attendance rows a week.
     *
     * ---------------------------------------------------------------------
     * Two decisions worth stating
     *
     * **A closed record carries its own `minutes_worked`** and is trusted; an
     * open one is counted up to now. That is what makes the figure move during
     * a shift rather than jumping when somebody clocks out — a manager checking
     * labour share at eight in the evening is asking about the shift that is
     * running.
     *
     * **The rate is today's**, because that is the only one stored. A rise next
     * month will therefore rewrite what last month appears to have cost, which
     * is wrong for payroll and acceptable for a percentage on a dashboard —
     * and it is why this is `Roster::payrollBetween()` and not a payslip. When
     * `staff.payslips` exists, this reads that instead and the contract does not
     * move.
     */
    public function payrollBetween(string $from, string $to, ?int $branchId = null): int
    {
        $now = Carbon::now();

        $row = Attendance::query()
            // Qualified, because the join brings a second `branch_id` and a
            // second `checked_in_at` would be as ambiguous: `staff_members`
            // carries the venue somebody is posted to, this carries the venue
            // they actually turned up at, and only the second one is worked.
            ->when($branchId !== null, fn ($query) => $query->where('staff.attendances.branch_id', $branchId))
            // Ranged on the raw column, never `whereDate` — see ModuleBoundaryTest.
            ->whereBetween('staff.attendances.checked_in_at', [
                Carbon::parse($from)->startOfDay(),
                Carbon::parse($to)->endOfDay(),
            ])
            ->join('staff.staff_members as m', 'm.id', '=', 'staff.attendances.staff_member_id')
            ->toBase()
            ->selectRaw(
                'coalesce(sum('
                .' case when staff.attendances.checked_out_at is null'
                .'   then greatest(0, extract(epoch from (? - staff.attendances.checked_in_at)) / 60)'
                .'   else staff.attendances.minutes_worked end'
                .' * m.hourly_rate / 60.0'
                .'), 0)::bigint as cost',
                [$now],
            )
            ->first();

        return (int) ($row->cost ?? 0);
    }

    /**
     * The same cost, laid out across the hours it was actually worked.
     *
     * `generate_series` walks each attendance hour by hour and the overlap of
     * the shift with each hour is what is charged to it, so a cook who worked
     * 14:20 → 17:00 lands in three hours with 40, 60 and 0 minutes rather than
     * as one spike at 14:00. That distinction is the whole value of the chart:
     * a manager reads it to move a start time by an hour.
     *
     * The open shift is bounded by `now()` from PHP, never SQL's — the platform
     * rule (a database clock and an application clock drift, and a labour figure
     * that moves depending on which one answered is a figure nobody trusts).
     *
     * Rows with nobody at work are simply absent. Twenty-four zeros would draw a
     * flat line that reads as "we were open and nobody worked"; a gap reads as a
     * closed venue, which is what it is.
     *
     * @return array<int, int>
     */
    public function payrollByHour(string $from, string $to, ?int $branchId = null): array
    {
        $now = Carbon::now();

        $query = Attendance::query()
            ->when($branchId !== null, fn ($query) => $query->where('staff.attendances.branch_id', $branchId))
            ->whereBetween('staff.attendances.checked_in_at', [
                Carbon::parse($from)->startOfDay(),
                Carbon::parse($to)->endOfDay(),
            ])
            ->join('staff.staff_members as m', 'm.id', '=', 'staff.attendances.staff_member_id')
            ->toBase();

        /*
         * One row per attendance PER HOUR it touches.
         *
         * `lateral generate_series` is what turns a shift into the hours it
         * covers. The alternative — twenty-four correlated subqueries, or the
         * whole table read into PHP — is the shape that stops working in the
         * second year of trading.
         */
        $query->crossJoin(DB::raw(
            'lateral generate_series('
            ." date_trunc('hour', staff.attendances.checked_in_at),"
            ." date_trunc('hour', coalesce(staff.attendances.checked_out_at, ?)),"
            ." interval '1 hour'"
            .') as slot'
        ));

        // The `?` above lives in the JOIN clause and its value has to be bound
        // to that slot: Laravel emits bindings select → from → join → where, and
        // a stamp bound to the wrong one is silently applied to the wrong
        // placeholder.
        $query->addBinding($now, 'join');

        $query->selectRaw('extract(hour from slot)::int as hour');
        $query->selectRaw(
            'coalesce(sum('
            .' greatest(0, extract(epoch from ('
            ."   least(coalesce(staff.attendances.checked_out_at, ?), slot + interval '1 hour')"
            .'   - greatest(staff.attendances.checked_in_at, slot)'
            .' )) / 3600.0)'
            .' * m.hourly_rate'
            .'), 0)::bigint as cost',
            [$now],
        );

        $rows = $query
            ->groupByRaw('extract(hour from slot)')
            ->orderByRaw('extract(hour from slot)')
            ->get();

        $hours = [];

        foreach ($rows as $row) {
            $cost = (int) $row->cost;

            if ($cost > 0) {
                $hours[(int) $row->hour] = $cost;
            }
        }

        return $hours;
    }

    public function hoursBetween(string $from, string $to, ?int $branchId = null): array
    {
        // One pass over the rota with attendance joined on: two queries would
        // mean two windows to keep identical, and a report whose halves
        // disagree is the report nobody trusts twice.
        $rows = Shift::query()
            ->join('staff.staff_members as m', 'm.id', '=', 'staff.shifts.staff_member_id')
            /*
             * Attendance has no shift id — a person clocks in, they do not
             * clock in *against a rota row* — so the two are matched by
             * person and day. `date(...)` on both sides rather than a range,
             * because a shift that starts at 23:00 and the clock-in at 23:04
             * belong to the same evening whichever way the window is cut.
             */
            ->leftJoin('staff.attendances as a', function ($join): void {
                /*
                 * A range on the bare column, not `date(a.checked_in_at) =
                 * date(...)`: a function around the column makes
                 * `(tenant_id, staff_member_id, checked_in_at)` unusable, and
                 * a venue with a year of attendance then scans the lot once
                 * per rostered shift. The day is computed from the OTHER
                 * table's column, which the planner is free to do per row.
                 */
                $join->on('a.staff_member_id', '=', 'staff.shifts.staff_member_id')
                    ->whereRaw("a.checked_in_at >= date_trunc('day', staff.shifts.starts_at)")
                    ->whereRaw("a.checked_in_at < date_trunc('day', staff.shifts.starts_at) + interval '1 day'");
            })
            ->whereBetween('staff.shifts.starts_at', [$from.' 00:00:00', $to.' 23:59:59'])
            ->when($branchId !== null, fn ($query) => $query->where('staff.shifts.branch_id', $branchId))
            ->groupBy('m.id', 'm.first_name', 'm.last_name', 'm.position')
            ->selectRaw('m.id as staff_member_id')
            ->selectRaw("trim(concat(m.last_name, ' ', m.first_name)) as name")
            ->selectRaw('m.position')
            ->selectRaw('count(distinct staff.shifts.id)::bigint as shifts')
            ->selectRaw('coalesce(sum(extract(epoch from (staff.shifts.ends_at - staff.shifts.starts_at)) / 60), 0)::bigint as scheduled_minutes')
            ->selectRaw('coalesce(sum(a.minutes_worked), 0)::bigint as worked_minutes')
            ->selectRaw('count(*) filter (where a.is_late)::bigint as late_count')
            ->orderByRaw('scheduled_minutes desc')
            ->toBase()
            ->get();

        return $rows->map(static fn (object $row): array => [
            'staff_member_id' => (int) $row->staff_member_id,
            'name' => (string) $row->name,
            'position' => (string) $row->position,
            'scheduled_minutes' => (int) $row->scheduled_minutes,
            'worked_minutes' => (int) $row->worked_minutes,
            'late_count' => (int) $row->late_count,
            'shifts' => (int) $row->shifts,
        ])->all();
    }
}
