<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Puts the audit trail behind the same wall as everything else it describes.
 *
 * Spatie's table ships without a tenant column, which leaves two bad options:
 * either the audit log is unreadable over the API, or one restaurant's owner
 * can read another restaurant's history. Deriving the tenant from the polymorphic
 * subject at read time is no answer either — the subject row is often exactly
 * what was deleted, and the entry has to outlive it.
 */
return new class extends Migration
{
    private function table(): string
    {
        return (string) config('activitylog.table_name', 'activity_log');
    }

    private function connection(): ?string
    {
        return config('activitylog.database_connection');
    }

    public function up(): void
    {
        Schema::connection($this->connection())->table($this->table(), function (Blueprint $table): void {
            // Nullable: platform-level events (a super admin acting outside any
            // restaurant) legitimately belong to no tenant.
            $table->unsignedBigInteger('tenant_id')->nullable()->after('id');

            // The two questions actually asked of an audit log: "what happened
            // here lately" and "what happened to orders here".
            $table->index(['tenant_id', 'created_at']);
            $table->index(['tenant_id', 'log_name']);
        });
    }

    public function down(): void
    {
        Schema::connection($this->connection())->table($this->table(), function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'created_at']);
            $table->dropIndex(['tenant_id', 'log_name']);
            $table->dropColumn('tenant_id');
        });
    }
};
