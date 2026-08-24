<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A payroll run: one month, one venue, and the moment somebody signed it off.
 *
 * ---------------------------------------------------------------------------
 * A calendar month, not a trading day
 *
 * Every other dated table on this platform groups by `business_date`, because
 * a restaurant's day runs 06:00 → 06:00 and the 01:30 bill belongs to the
 * evening that is still finishing. Payroll is the one place that reasoning does
 * not apply. An employee is paid for a MONTH — it is what the payslip is headed
 * with, what the tax return is filed against, and what they will argue with you
 * about — and no month boundary in Uzbekistan has ever been moved to six in the
 * morning. So `period` is `char(7)`, `YYYY-MM`, and it is a string rather than a
 * date because a month is not a day and storing it as one invites somebody to
 * compare it against `now()` and be a fortnight out.
 *
 * `char(7)` rather than `varchar`: the value is exactly seven characters
 * forever, and a fixed width is what lets `order by period` be a chronological
 * sort for free — which is the default sort of the list screen.
 *
 * ---------------------------------------------------------------------------
 * Why the window is stored and not derived
 *
 * `starts_on` and `ends_on` are the first and last day of `period`, so they
 * look like duplication and are not. They are what the lines were actually
 * computed over, and once a run is finalised that has to stay knowable
 * independently of anybody's ability to re-derive it. A run built over
 * `2026-08-01 … 2026-08-31` and later re-read against a window some future
 * helper computes differently — a timezone change, an off-by-one on the last
 * day of February, a "payroll month runs to the 25th" setting somebody adds —
 * would silently disagree with the payslip that was already printed and paid.
 * Frozen columns cannot drift; a derivation can.
 *
 * ---------------------------------------------------------------------------
 * The ladder: draft → finalised, and nothing after it
 *
 * A draft is a computation. It may be rebuilt from attendance as often as
 * anybody likes, and rebuilding replaces its lines wholesale — that is what a
 * manager does when they notice a missing clock-out on the 29th.
 *
 * Finalised is a signature. From that moment the run refuses to be rebuilt and
 * its lines refuse to be edited, because the figures have left the building:
 * they have been paid, or filed, or both. There is deliberately no "reopen"
 * verb here. A month that turns out to be wrong after it was signed off is
 * corrected the way accounting corrects things — by an adjustment in the next
 * run — not by editing what was signed. `finance.shift_already_closed` makes
 * the same argument about a till shift, for the same reason.
 *
 * ---------------------------------------------------------------------------
 * `finalised_by_user_id` is a plain column, not a foreign key
 *
 * Deliberately, and it is the one place this table breaks the pattern
 * `staff.shift_swaps.decided_by` set. A swap that loses the manager who decided
 * it loses a note; a payslip that loses the manager who signed it loses the
 * only record of who authorised money leaving the business. With a
 * `nullOnDelete` constraint, deleting a departed manager's account would quietly
 * blank the signature on every month they ever approved — and a
 * `restrictOnDelete` would mean nobody who has ever run payroll can be removed.
 * A bare id keeps the fact, and the fact is what an inspector asks for.
 *
 * ---------------------------------------------------------------------------
 * Money is integer tiyin, here as everywhere (1 so'm = 100 tiyin)
 *
 * The three totals are the sum of the lines and are stored rather than summed
 * on read for exactly one reason: after `finalised_at` they must answer the
 * same number forever, and a sum over a child table answers whatever the child
 * table currently holds.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff.payroll_periods', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            /*
             * Nullable, with this platform's usual meaning: a named venue is
             * that venue's wage bill, and a null branch is the run across the
             * whole business. Both are legitimate — a single-site café runs one
             * of the second kind, a chain runs one of the first per venue —
             * which is why the uniqueness below has to be written in two halves.
             *
             * `nullOnDelete` rather than cascade: closing a branch must not
             * delete the record of what it paid people while it was open.
             */
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->nullOnDelete();

            $table->char('period', 7)->comment('The payroll month, YYYY-MM');

            $table->date('starts_on')->comment('First day of the window the lines were computed over');
            $table->date('ends_on')->comment('Last day of that window, inclusive');

            $table->string('status', 16)->default('draft')->comment('draft | finalised');

            // Gross is what was earned, deductions are what was withheld, net is
            // what is handed over. Three columns rather than two so that a
            // payslip and a tax return can both be answered from the same row.
            $table->bigInteger('gross_tiyin')->default(0);
            $table->bigInteger('deductions_tiyin')->default(0);
            $table->bigInteger('net_tiyin')->default(0);

            $table->datetime('finalised_at')->nullable();
            $table->unsignedBigInteger('finalised_by_user_id')->nullable()
                ->comment('Who signed it off — kept as a bare id so deleting their account cannot erase the signature');
            $table->string('note', 255)->nullable();

            $table->timestamps();

            // The list screen: this restaurant's runs, newest month first,
            // optionally narrowed to the ones still open.
            $table->index(['tenant_id', 'status'], 'payroll_periods_by_status');
        });

        /*
         * Uniqueness in two halves, because PostgreSQL does not think two NULLs
         * are equal.
         *
         * A plain `unique(tenant_id, branch_id, period)` would enforce nothing
         * at all on the business-wide runs — the ones whose `branch_id` is null
         * — and those are precisely the ones a second POST would duplicate. Two
         * rows for August is two payslips for August, which is either a double
         * payment or an argument, depending on which one the accountant opened.
         *
         * The same shape as `analytics.daily_facts`, and for the same reason;
         * that migration spells the reasoning out at length.
         */
        DB::statement(
            'create unique index payroll_periods_one_run_per_venue'
            .' on staff.payroll_periods (tenant_id, branch_id, period)'
            .' where branch_id is not null',
        );

        DB::statement(
            'create unique index payroll_periods_one_run_per_business'
            .' on staff.payroll_periods (tenant_id, period)'
            .' where branch_id is null',
        );

        /*
         * The sweep in `2026_08_18_170000` only saw the tables that existed when
         * it ran, so a table created afterwards has to guard itself;
         * RowLevelSecurityTest walks pg_class and fails when one does not. On a
         * table holding what everybody in the building is paid, a missing policy
         * is not a tidiness problem.
         */
        RowLevelSecurity::guard('staff.payroll_periods');
    }

    public function down(): void
    {
        RowLevelSecurity::release('staff.payroll_periods');
        DB::statement('drop index if exists staff.payroll_periods_one_run_per_venue');
        DB::statement('drop index if exists staff.payroll_periods_one_run_per_business');
        Schema::dropIfExists('staff.payroll_periods');
    }
};
