<?php

declare(strict_types=1);

namespace Modules\Staff\Services;

use App\Support\Errors\ApiException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Modules\Staff\Models\Attendance;
use Modules\Staff\Models\PayrollLine;
use Modules\Staff\Models\PayrollPeriod;

/**
 * Turning a month of clock-ins into a month of payslips.
 *
 * ---------------------------------------------------------------------------
 * Attendance, never the rota
 *
 * `Roster::payrollBetween()` is written around the same rule and says it in as
 * many words: *"A shift that was planned and not worked costs nothing, and
 * paying against a plan is how a labour percentage stops matching the bank."*
 * This service is the payslip that method promised — it counts the same rows,
 * with the same treatment of an open record — so the dashboard's labour share
 * and the wage bill agree about what a month cost. If the two ever disagree,
 * one of them has been changed alone, and that is the bug.
 *
 * ---------------------------------------------------------------------------
 * The rate is snapshotted here and nowhere else
 *
 * `staff_members.hourly_rate` is today's rate. Reading it at build time and
 * copying it onto the line is what makes a finalised month a record rather than
 * a query that happens to have been run in the past — `EloquentRoster` states
 * that defect against itself and names this as the fix.
 *
 * ---------------------------------------------------------------------------
 * Integer tiyin, all the way down
 *
 * The minutes are summed in SQL and the money is multiplied in PHP, which looks
 * like a split for no reason and is not: `minutes * rate / 60` in SQL would go
 * through `numeric` or `double` on its way back, and a tenth of a tiyin per
 * person per month is a figure that only ever surfaces as a payroll total that
 * does not reconcile. `intdiv()` cannot do that. Rounded DOWN rather than to
 * nearest, because the alternative is paying for minutes nobody worked.
 */
final class PayrollRun
{
    /**
     * Build — or rebuild — the lines for a run.
     *
     * Rebuilding a draft replaces its lines wholesale rather than reconciling
     * them, and that is deliberate. The lines are a computation over attendance
     * with two hand-entered columns on top; reconciling would mean deciding
     * whose bonus survives a rebuild that no longer contains that person, and
     * every answer to that is a surprise. Replacement is at least a rule
     * somebody can hold in their head: rebuild the month, re-enter the bonuses.
     *
     * A finalised run refuses outright. It has been paid.
     *
     * @throws ApiException
     */
    public function build(PayrollPeriod $period): PayrollPeriod
    {
        $this->refuseIfFinalised($period);

        // Read before the transaction opens: it is a scan over a month of
        // attendance and holds no locks worth holding while it runs.
        $rows = $this->attendanceTotals($period);

        DB::transaction(function () use ($period, $rows): void {
            /*
             * A hard delete, and the one place in this module that is right.
             * Convention 7 protects orders and payments — things that happened.
             * A draft line is not something that happened; it is arithmetic
             * about to be redone, and soft-deleting it would leave the unique
             * index `(payroll_period_id, staff_member_id)` blocking the row that
             * replaces it.
             */
            $period->lines()->delete();

            foreach ($rows as $row) {
                $minutes = (int) $row->minutes_worked;
                $rate = (int) $row->hourly_rate;
                $basic = intdiv($minutes * $rate, 60);

                PayrollLine::create([
                    'tenant_id' => $period->tenant_id,
                    'payroll_period_id' => $period->id,
                    'staff_member_id' => (int) $row->staff_member_id,
                    'minutes_worked' => $minutes,
                    'hourly_rate' => $rate,
                    'basic_tiyin' => $basic,
                    /*
                     * Zero, honestly. There is no service-charge pool table on
                     * this platform — `BillTotals` charges it and Finance banks
                     * it, and nothing records how it is divided — so the builder
                     * cannot know a share and does not guess one. A manager sets
                     * it through the PATCH endpoint, which is how a restaurant
                     * that splits the pool on paper works today.
                     */
                    'service_charge_tiyin' => 0,
                    'bonus_tiyin' => 0,
                    'deductions_tiyin' => 0,
                    'net_tiyin' => $basic,
                    'shifts_count' => (int) $row->shifts_count,
                    'late_count' => (int) $row->late_count,
                ]);
            }

            $this->recomputeTotals($period);
        });

        return $period->refresh();
    }

    /**
     * Re-sum the three period totals from the lines that are there now.
     *
     * Called after a build, after a line is edited by hand, and again at
     * finalisation. The last of those looks redundant and is the one that
     * matters most: it is the moment the numbers stop being derivable, so it is
     * the moment they had better be right.
     *
     * Stored rather than summed on read, because after `finalised_at` these
     * three have to answer the same number forever and a sum over a child table
     * answers whatever the child table currently holds.
     */
    public function recomputeTotals(PayrollPeriod $period): PayrollPeriod
    {
        $totals = PayrollLine::query()
            ->where('payroll_period_id', $period->id)
            ->toBase()
            ->selectRaw(
                'coalesce(sum(basic_tiyin + service_charge_tiyin + bonus_tiyin), 0)::bigint as gross,'
                .' coalesce(sum(deductions_tiyin), 0)::bigint as deductions',
            )
            ->first();

        $gross = (int) ($totals->gross ?? 0);
        $deductions = (int) ($totals->deductions ?? 0);

        $period->update([
            'gross_tiyin' => $gross,
            'deductions_tiyin' => $deductions,
            // Not a fourth sum. Net is gross minus deductions by definition, and
            // summing the lines' own `net_tiyin` separately would let the two
            // disagree the moment one line was written with an arithmetic slip.
            'net_tiyin' => $gross - $deductions,
        ]);

        return $period;
    }

    /** @throws ApiException */
    public function refuseIfFinalised(PayrollPeriod $period): void
    {
        if ($period->is_finalised) {
            throw ApiException::of('staff.payroll_finalised', meta: [
                'period' => $period->period,
                'finalised_at' => $period->finalised_at?->toIso8601String(),
            ]);
        }
    }

    /**
     * Minutes, turnouts and lateness per person over the run's own window.
     *
     * One aggregate rather than a query per employee: a chain venue has thirty
     * people and a month has thirty days, and the loop version is nine hundred
     * statements to answer one screen.
     *
     * Four things worth stating about the SQL:
     *
     * **The raw `checked_in_at` column is ranged, never wrapped.** `whereDate`,
     * `whereMonth` and `whereYear` all compile to a function over the column,
     * PostgreSQL cannot use an index on a value it has to transform first, and
     * `ModuleBoundaryTest` fails the build on all three by name. The window
     * comes from the period's own frozen `starts_on`/`ends_on` rather than from
     * anything derived at read time.
     *
     * **An open attendance is counted up to now**, exactly as
     * `EloquentRoster::payrollBetween()` does. `now()` is bound from PHP rather
     * than written into the SQL — a replica or a pooler may have a different
     * server timezone, and `ModuleBoundaryTest` refuses raw SQL containing
     * `now()` for that reason.
     *
     * **The branch scope is dropped and the period's own branch applied
     * instead.** The run declares its scope in its `branch_id` column: a
     * business-wide run must read every venue's hours even when the request
     * happens to carry an `X-Branch`, or a rebuild from one till would quietly
     * turn the group's wage bill into that venue's.
     *
     * **A member who has since left is still paid.** The join does not exclude
     * soft-deleted staff, because somebody taken off the roster on the 20th
     * still worked the first nineteen days and is owed for them.
     *
     * @return Collection<int, \stdClass>
     */
    private function attendanceTotals(PayrollPeriod $period): Collection
    {
        $now = Carbon::now();

        return Attendance::query()
            ->withoutGlobalScope('branch')
            ->when(
                $period->branch_id !== null,
                fn ($query) => $query->where('staff.attendances.branch_id', $period->branch_id),
            )
            // Qualified throughout, because the join brings a second `branch_id`
            // and a second `deleted_at`: `staff_members` carries the venue
            // somebody is posted to, this carries the venue they turned up at,
            // and only the second one is worked.
            ->whereBetween('staff.attendances.checked_in_at', [
                $period->starts_on->copy()->startOfDay(),
                $period->ends_on->copy()->endOfDay(),
            ])
            ->join('staff.staff_members as m', 'm.id', '=', 'staff.attendances.staff_member_id')
            ->toBase()
            ->selectRaw(
                'staff.attendances.staff_member_id as staff_member_id,'
                .' m.hourly_rate as hourly_rate,'
                .' count(*) as shifts_count,'
                .' count(*) filter (where staff.attendances.is_late) as late_count,'
                .' coalesce(sum('
                .'   case when staff.attendances.checked_out_at is null'
                /*
                 * floor(), not round(): a shift still running is paid for the
                 * minutes already worked, never for the one in progress. Cast to
                 * bigint on the spot so both arms of the CASE are integers and
                 * the sum never travels through double precision — the closed
                 * arm is already `minutes_worked`, an integer column, and
                 * letting the two resolve to a float would put the one kind of
                 * value this platform refuses to hold money in at the bottom of
                 * a wage calculation.
                 */
                .'     then greatest(0, floor(extract(epoch from (? - staff.attendances.checked_in_at)) / 60))::bigint'
                .'     else staff.attendances.minutes_worked end'
                .' ), 0)::bigint as minutes_worked',
                [$now],
            )
            ->groupBy('staff.attendances.staff_member_id', 'm.hourly_rate')
            // Stable order so a rebuild produces the same rows in the same
            // sequence — the thing that makes two runs comparable by eye.
            ->orderBy('staff.attendances.staff_member_id')
            ->get();
    }
}
