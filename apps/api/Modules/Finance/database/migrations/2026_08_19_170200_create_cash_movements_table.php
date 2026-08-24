<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Notes entering the drawer for a reason that is not a sale.
 *
 * The hole this fills: expected cash was float + cash takings + rounding + cash
 * tips − cash payouts, and nothing in that list is money somebody PUT IN. A
 * manager bringing 50 000 so'm of small notes so the till can give change was
 * recorded in the POS and nowhere Finance could see, so at closing the drawer
 * held exactly 50 000 so'm more than the report expected — and the report said
 * that about the person who counted it.
 *
 * ---------------------------------------------------------------------------
 * The asymmetry, stated rather than hidden
 *
 * `direction` carries both values and only `in` is written today. The `out` side
 * already has a home — `expenses.paid_in_cash`, which is what `recordCashOut()`
 * writes and what the expected-cash arithmetic has subtracted since the module
 * was built. Moving it here would be the tidier schema and would also move the
 * ground under the collection flow, the expenses screen, the seeder and every
 * test that asserts a payout, for no gain that a restaurant can see.
 *
 * So the column exists, the shape is ready, and the day the two are unified the
 * data is already in the right form. Until then: money in is a row here, money
 * out is a cash expense, and the formula on CashShift names both.
 *
 * `cash_count_id` is the good case: cash brought to the till can be counted by
 * note like any other movement of money, and when it was, the count is attached
 * rather than reduced to a total somebody typed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('finance.cash_movements', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->nullOnDelete();
            $table->foreignId('cash_shift_id')->constrained('finance.cash_shifts')->cascadeOnDelete();
            $table->foreignId('cash_count_id')->nullable()->constrained('finance.cash_counts')->nullOnDelete();
            $table->date('business_date')->nullable()->comment('The trading day, from occurred_at — Q3');
            $table->string('direction', 8)->comment('in|out — only `in` is written today, see the class docblock');
            $table->unsignedBigInteger('amount')->comment('Amount in tiyin (1 UZS = 100 tiyin), always positive');
            $table->string('reason', 255)->comment('Why the drawer was opened — never optional');
            $table->unsignedBigInteger('recorded_by_user_id')->nullable();
            $table->datetime('occurred_at');
            $table->timestamps();

            $table->index(['tenant_id', 'cash_shift_id', 'direction']);
            $table->index(['tenant_id', 'branch_id', 'business_date']);
        });

        RowLevelSecurity::guard('finance.cash_movements');
    }

    public function down(): void
    {
        // Dropping the table takes the policy with it.
        Schema::dropIfExists('finance.cash_movements');
    }
};
