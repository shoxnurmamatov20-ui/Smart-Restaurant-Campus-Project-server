<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One person, one month: the row a payslip is printed from.
 *
 * ---------------------------------------------------------------------------
 * `hourly_rate` is a snapshot, and that is the whole reason this table exists
 *
 * `EloquentRoster::payrollBetween()` states the defect against itself, in its
 * own docblock: *"The rate is today's, because that is the only one stored. A
 * rise next month will therefore rewrite what last month appears to have cost,
 * which is wrong for payroll and acceptable for a percentage on a dashboard."*
 * It then names the fix — *"When `staff.payslips` exists, this reads that
 * instead"* — and this column is it.
 *
 * `staff_members.hourly_rate` is a fact about today. Give somebody a raise on
 * the first of September and every figure derived from that column restates
 * August at the new rate: the payslip already printed, the labour share already
 * reported, the month already paid. Copying the rate onto the line at the moment
 * the run is built is what makes a finalised month a historical record rather
 * than a query that happens to have been run in the past.
 *
 * ---------------------------------------------------------------------------
 * `minutes_worked` comes from ATTENDANCE, never from the rota
 *
 * The same rule `Roster::payrollBetween()` is written around, in the same words:
 * *"A shift that was planned and not worked costs nothing, and paying against a
 * plan is how a labour percentage stops matching the bank."* A rota is a
 * promise about the future; an attendance row is a record of a door opening.
 * Only the second one is owed money.
 *
 * An attendance still open when the run is built is counted up to that moment,
 * which is how a run for the current month behaves sensibly mid-shift. A closed
 * one carries its own frozen `minutes_worked` and is trusted.
 *
 * ---------------------------------------------------------------------------
 * `service_charge_tiyin` — an honest zero
 *
 * There is no service-charge pool on this platform. `BillTotals` computes a
 * service charge onto a bill and `finance` banks it with the takings; nothing
 * anywhere records how the collected pool is divided among the people who
 * earned it, because nobody has been asked to build that yet.
 *
 * So this column is written **0** by the builder, every time, and is set by hand
 * through `PATCH staff/payroll/{period}/lines/{line}` — which is exactly how a
 * restaurant that splits a pool on paper works today. It is here rather than
 * absent because a payslip that cannot show the service share is a payslip
 * nobody believes, and because when the pool table does arrive the builder
 * starts filling this column and no schema moves.
 *
 * ---------------------------------------------------------------------------
 * One `deductions_tiyin`, not five columns
 *
 * An advance taken mid-month, a broken tray, income tax withheld: all of them
 * are money not handed over, and `note` carries which. Five named columns would
 * be five guesses about a payroll regime this platform does not model, four of
 * which would sit at zero forever while the fifth quietly absorbed everything.
 * One column and a sentence is honest about what is actually known.
 *
 * The column is signed, and so is `net_tiyin`: an advance larger than the month
 * that followed it is a real thing, and a person who owes the restaurant money
 * has a negative net. An unsigned column would have refused the row and the
 * refusal would have looked like a bug.
 *
 * ---------------------------------------------------------------------------
 * `shifts_count` and `late_count`
 *
 * The payslip's "period" block. Counted from attendance rows in the window, so
 * `shifts_count` is turnouts rather than rostered slots — see above. `late_count`
 * is what `staff.attendances.is_late` already records, brought forward so a
 * finalised month keeps its own version of it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff.payroll_lines', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            /*
             * No `branch_id` here, and that is not an oversight. A run is for one
             * venue's people; a line belongs to the run. Repeating the venue on
             * the child would create a second place for it to be wrong, and the
             * only question anybody asks of a line is "which run is this part
             * of".
             */
            $table->foreignId('payroll_period_id')->constrained('staff.payroll_periods')->cascadeOnDelete();
            $table->foreignId('staff_member_id')->constrained('staff.staff_members')->cascadeOnDelete();

            $table->unsignedInteger('minutes_worked')->default(0)
                ->comment('From attendance, not from the rota');
            $table->bigInteger('hourly_rate')->default(0)
                ->comment('Tiyin per hour, snapshotted when the run was built');

            // minutes x rate / 60, integer arithmetic, rounded down. Rounded
            // down rather than to nearest because the alternative is inventing
            // tiyin nobody worked for, and a rounding rule that favours the
            // employer by at most one tiyin a month is not a rule anybody will
            // argue about.
            $table->bigInteger('basic_tiyin')->default(0);
            $table->bigInteger('service_charge_tiyin')->default(0)
                ->comment('Share of the service-charge pool — set by hand; there is no pool table yet');
            $table->bigInteger('bonus_tiyin')->default(0);
            $table->bigInteger('deductions_tiyin')->default(0)
                ->comment('Advances, breakages, tax — one column, with `note` saying which');
            $table->bigInteger('net_tiyin')->default(0)
                ->comment('basic + service + bonus - deductions; may be negative');

            $table->unsignedSmallInteger('shifts_count')->default(0);
            $table->unsignedSmallInteger('late_count')->default(0);

            $table->string('note', 255)->nullable();
            $table->timestamps();

            /*
             * One line per person per run, enforced rather than assumed.
             *
             * Both nullable-free, so a plain unique index says what is meant
             * with no partial-index gymnastics — unlike the parent, where the
             * nullable branch forced the split.
             *
             * The failure this prevents is a rebuild that deleted three lines
             * and inserted four: two rows for one cook is a payslip that pays
             * August twice, and it is the kind of thing nobody notices until
             * the bank balance does.
             */
            $table->unique(['payroll_period_id', 'staff_member_id'], 'payroll_lines_one_per_person');

            // "This run's lines", which is the only query shape that reads this
            // table. Tenant first because row-level security filters on it and
            // an index that starts elsewhere cannot help the policy.
            $table->index(['tenant_id', 'payroll_period_id'], 'payroll_lines_by_run');
        });

        RowLevelSecurity::guard('staff.payroll_lines');
    }

    public function down(): void
    {
        RowLevelSecurity::release('staff.payroll_lines');
        // Dropping the table takes its indexes and its policy with it.
        Schema::dropIfExists('staff.payroll_lines');
    }
};
