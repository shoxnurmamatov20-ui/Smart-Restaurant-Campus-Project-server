<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Resolves a signed-in account to its employee record.
 *
 * Runs on every clock-in, every shift screen and every payroll line, and had
 * no index — the lookup scanned every employee in the restaurant.
 *
 * Every index here leads with `tenant_id`, because the BelongsToTenant global
 * scope puts `tenant_id = ?` in front of every query the application makes. An
 * index on the foreign key alone would be the wrong shape.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('staff.staff_members', function (Blueprint $table): void {
            // "Which employee is this account?"
            $table->index(['tenant_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::table('staff.staff_members', function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'user_id']);
        });
    }
};
