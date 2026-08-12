<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The audit UI's event filter.
 *
 * `GET /api/v1/audit?filter[event]=deleted` — "what has been deleted here" is
 * the first thing anyone asks the audit log, and it was answered by scanning
 * every line the restaurant has ever written.
 *
 * Every index here leads with `tenant_id`, because the BelongsToTenant global
 * scope puts `tenant_id = ?` in front of every query the application makes. An
 * index on the foreign key alone would be the wrong shape.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('activity_log', function (Blueprint $table): void {
            // "What was deleted here, and when?"
            $table->index(['tenant_id', 'event', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::table('activity_log', function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'event', 'created_at']);
        });
    }
};
