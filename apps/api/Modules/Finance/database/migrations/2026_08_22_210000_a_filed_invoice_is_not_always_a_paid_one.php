<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * When the money actually left, as opposed to when the paper arrived.
 *
 * `finance.expenses` had one date — `spent_at` — and the module's own comment
 * said the rest out loud: *"there is no paid column and that is not an
 * omission: an Expense row IS money that left"*. That reading is true of a
 * payout from the drawer and false of everything an accountant files on the
 * books screen. The electricity invoice arrives on the 3rd, is entered on the
 * 3rd because that is when somebody has it in their hand, and is paid on the
 * 20th. Between those two dates the restaurant owes money it has already
 * booked, and the design's paid/unpaid chip on that table is asking exactly
 * that question.
 *
 * So the column is nullable and the null means something: filed, not yet paid.
 *
 * ---------------------------------------------------------------------------
 * Every existing row is backfilled as paid
 *
 * Not a convenience — it is the only reading that does not rewrite history.
 * Every row already in this table was written under the old rule, where filing
 * an expense WAS the payment: the till payouts genuinely left the drawer, and
 * the invoices somebody typed were typed as money spent. Leaving them null
 * would put the whole of a restaurant's back catalogue into "unpaid" overnight
 * and hand the accountant a payables figure that never existed.
 *
 * `spent_at` rather than `now()`, so a paid date is never later than the
 * spending it records — a row backfilled with today's clock would report the
 * rent for March as paid in August.
 *
 * ---------------------------------------------------------------------------
 * Nothing about the drawer changes
 *
 * `paid_in_cash` still decides whether a shift's expected cash falls, and it is
 * a different fact: it says WHERE the money came from, this says WHETHER it has
 * gone. A cash payout is both — it is written with `paid_at` set, because notes
 * left the till at the moment it was recorded.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('finance.expenses', function (Blueprint $table): void {
            $table->datetime('paid_at')->nullable()
                ->comment('When the money left. Null means filed but not yet paid.');
        });

        DB::statement('update finance.expenses set paid_at = coalesce(spent_at, created_at)');

        Schema::table('finance.expenses', function (Blueprint $table): void {
            /*
             * The one question this column is asked: what is still owed.
             *
             * Tenant first, because every read of this table is already scoped
             * to one restaurant — the books screen asks "what has this business
             * not paid", never "what is unpaid across the platform".
             */
            $table->index(['tenant_id', 'paid_at'], 'expenses_unpaid_index');
        });
    }

    public function down(): void
    {
        Schema::table('finance.expenses', function (Blueprint $table): void {
            $table->dropIndex('expenses_unpaid_index');
            $table->dropColumn('paid_at');
        });
    }
};
