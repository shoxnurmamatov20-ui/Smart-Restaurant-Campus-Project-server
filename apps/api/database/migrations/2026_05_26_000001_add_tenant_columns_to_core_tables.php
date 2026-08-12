<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Retro-fits `tenant_id` onto the tables that existed before tenancy landed.
 *
 * Module tables created after this point declare `tenant_id` in their own
 * create-migration instead — see Modules/Menu for the pattern.
 */
return new class extends Migration
{
    /**
     * Tables that predate tenancy and therefore need the column added.
     *
     * @var array<int, string>
     */
    private const LEGACY_TABLES = [
        'public.users',
        'telegram.tg_bots',
        'telegram.tg_bot_users',
        'telegram.tg_messages',
        'telegram.tg_command_logs',
    ];

    public function up(): void
    {
        foreach (self::LEGACY_TABLES as $table) {
            $this->addTenantColumn($table, after: 'id');
        }

        // An email is unique *within a restaurant*, not across the platform —
        // the same person may work at two different customers of ours.
        Schema::table('public.users', function (Blueprint $table): void {
            $table->dropUnique(['email']);
            $table->unique(['tenant_id', 'email']);
        });

        if (Schema::hasTable('telegram.tg_bots')) {
            Schema::table('telegram.tg_bots', function (Blueprint $table): void {
                $table->dropUnique(['key']);
                $table->unique(['tenant_id', 'key']);
                $table->index(['tenant_id', 'enabled', 'audience']);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('telegram.tg_bots')) {
            Schema::table('telegram.tg_bots', function (Blueprint $table): void {
                $table->dropUnique(['tenant_id', 'key']);
                $table->dropIndex(['tenant_id', 'enabled', 'audience']);
                $table->unique('key');
            });
        }

        Schema::table('public.users', function (Blueprint $table): void {
            $table->dropUnique(['tenant_id', 'email']);
            $table->unique('email');
        });

        foreach (array_reverse(self::LEGACY_TABLES) as $table) {
            $this->dropTenantColumn($table);
        }
    }

    private function addTenantColumn(string $table, string $after): void
    {
        if (! Schema::hasTable($table) || Schema::hasColumn($table, 'tenant_id')) {
            return;
        }

        Schema::table($table, static function (Blueprint $blueprint) use ($after): void {
            $blueprint->foreignId('tenant_id')
                ->nullable()
                ->after($after)
                ->constrained('public.tenants')
                ->nullOnDelete();
        });
    }

    private function dropTenantColumn(string $table): void
    {
        if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'tenant_id')) {
            return;
        }

        Schema::table($table, static function (Blueprint $blueprint): void {
            $blueprint->dropConstrainedForeignId('tenant_id');
        });
    }
};
