<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Two lookups the till makes on every screen.
 *
 * `payments.order_id` is asked every time a cashier opens a bill to see what
 * has already been paid on it, and it had no index at all.
 *
 * Every index here leads with `tenant_id`, because the BelongsToTenant global
 * scope puts `tenant_id = ?` in front of every query the application makes. An
 * index on the foreign key alone would be the wrong shape.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('finance.payments', function (Blueprint $table): void {
            // "What has been paid on this bill?" — asked before every settlement
            $table->index(['tenant_id', 'order_id']);
        });

        Schema::table('finance.cash_shifts', function (Blueprint $table): void {
            // "Which shifts did this cashier open?" — the first question after a discrepancy
            $table->index(['tenant_id', 'opened_by_user_id']);
        });
    }

    public function down(): void
    {
        Schema::table('finance.cash_shifts', function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'opened_by_user_id']);
        });

        Schema::table('finance.payments', function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'order_id']);
        });
    }
};
