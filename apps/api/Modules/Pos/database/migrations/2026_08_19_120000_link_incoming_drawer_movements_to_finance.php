<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The other half of the drawer's back-link.
 *
 * `finance_expense_id` recorded the Finance row a movement OUT of the drawer
 * created. Money going in had no such row at all — the till wrote its own
 * movement and told Finance nothing — so a manager bringing 50 000 so'm of
 * change at six o'clock produced a shift that closed exactly 50 000 over, and
 * the cashier looked like somebody who could not count.
 *
 * Finance now takes those through `TillLedger::recordCashIn()`, which writes to
 * `finance.cash_movements` rather than to `finance.expenses` — a different table
 * because it is a different thing: an expense is money spent, and this is money
 * that arrived without being earned. So it needs its own column rather than
 * borrowing one whose name would then be a lie.
 *
 * No foreign key, matching `finance_expense_id`: `pos` and `finance` are
 * separate schemas owned by separate modules, and a constraint between them
 * would make either one's migration depend on the other's order.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pos.drawer_movements', function (Blueprint $table): void {
            $table->unsignedBigInteger('finance_movement_id')->nullable()->after('finance_expense_id')
                ->comment('finance.cash_movements id written for an incoming movement');
        });
    }

    public function down(): void
    {
        Schema::table('pos.drawer_movements', function (Blueprint $table): void {
            $table->dropColumn('finance_movement_id');
        });
    }
};
