<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The month an accountant has signed off, and cannot be written into again.
 *
 * Until now the only closing this platform performed was per till, per day:
 * `POST /finance/shifts/{id}/lock` then `/close`. A MONTH had no existence at
 * all — no table, no state, nothing to consult — so an invoice dated the 3rd of
 * last month could be entered on the 20th of this one, land in a period whose
 * figures had already gone to the tax office, and change a statement that had
 * been printed and signed.
 *
 * ---------------------------------------------------------------------------
 * The table is the small half. The lock is the feature.
 *
 * A close endpoint that only sets a status is a button that changes a label:
 * everything that was possible before it is still possible after. What makes
 * this real is `Modules\Finance\Services\PeriodLock` and the observer that calls
 * it on the way in — every money row in this module (payment, expense, cash
 * movement, cash shift) consults this table before it is written, and a row
 * whose `business_date` falls inside a locked month is refused with
 * `finance.period_closed`.
 *
 * **`TillLedger::amendClosedShift()` is not exempt.** It is the one door the
 * platform opens into a sealed SHIFT — an offline sale that reached the server
 * after the Z was taken — and it was tempting to let it through here too. It
 * must not be: a sealed shift is last night, and a closed month is a figure that
 * has left the building. When the two collide, the amendment belongs in the open
 * month with a note, and the person doing it has to make that choice
 * deliberately rather than have the system make it silently.
 *
 * ---------------------------------------------------------------------------
 * Per restaurant, not per branch
 *
 * A period is an accounting fact and a restaurant files one return, not five.
 * Closing a single venue's January while the others stay open would produce a
 * business whose books are half shut — and the first question anyone asks of a
 * half-shut month is which half.
 *
 * The trading day is what is matched, not the calendar day: `business_date` is
 * already stamped on every money row from the venue's own 06:00 boundary, so a
 * bill rung up at 01:30 on the 1st belongs to the month that is finishing, which
 * is the month it will be closed with.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('finance.accounting_periods', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            // `YYYY-MM`. A char rather than a date, because a period is a month
            // and a date column would invite a day into it — and then two rows
            // for one month that differ in a field nobody meant to set.
            $table->char('period', 7);

            // The inclusive trading days this period covers, stored rather than
            // derived. A month's first and last day are obvious; storing them is
            // what lets the lock be one indexed range comparison per write
            // instead of string arithmetic on every row.
            $table->date('starts_on');
            $table->date('ends_on');

            // `open` → `closed`. Reopening is a deliberate act with its own
            // permission and its own audit row; see AccountingPeriodController.
            $table->string('status', 8)->default('open');

            /*
             * What the month came to, frozen at the moment it was closed.
             *
             * Not a cache. These are the figures the close was signed against,
             * and they must not move afterwards — which is exactly what they
             * would do if the screen recomputed them, because a refund booked
             * next week reaches back into the same rows. An accountant asked six
             * months later what they signed has to be able to read the answer.
             */
            $table->bigInteger('revenue_tiyin')->default(0);
            $table->bigInteger('expenses_tiyin')->default(0);

            $table->datetime('closed_at')->nullable();
            $table->unsignedBigInteger('closed_by_user_id')->nullable();
            $table->datetime('reopened_at')->nullable();
            $table->unsignedBigInteger('reopened_by_user_id')->nullable();
            $table->string('note', 255)->nullable();

            $table->timestamps();

            // "Is this date inside a closed month for this restaurant" — the one
            // query shape the lock makes, and it runs on every money write.
            $table->index(['tenant_id', 'status', 'starts_on', 'ends_on'], 'accounting_periods_lock_probe');
        });

        // One row per month per restaurant. Partial for the usual reason:
        // `tenant_id` is nullable and PostgreSQL does not equate two nulls.
        DB::statement(
            'create unique index accounting_periods_one_row_per_month'
            .' on finance.accounting_periods (tenant_id, period)'
            .' where tenant_id is not null',
        );

        RowLevelSecurity::guard('finance.accounting_periods');
    }

    public function down(): void
    {
        Schema::dropIfExists('finance.accounting_periods');
    }
};
