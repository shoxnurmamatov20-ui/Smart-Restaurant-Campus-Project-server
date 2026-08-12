<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The floor map's own question.
 *
 * Reservations were indexed by status and by guest phone, but not by table —
 * so "is table A-7 booked tonight?", which the host asks for every table on
 * the screen, scanned the whole table each time.
 *
 * Every index here leads with `tenant_id`, because the BelongsToTenant global
 * scope puts `tenant_id = ?` in front of every query the application makes. An
 * index on the foreign key alone would be the wrong shape.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tables.reservations', function (Blueprint $table): void {
            // "Is this table booked, and when?"
            $table->index(['tenant_id', 'restaurant_table_id', 'starts_at']);
        });
    }

    public function down(): void
    {
        Schema::table('tables.reservations', function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'restaurant_table_id', 'starts_at']);
        });
    }
};
