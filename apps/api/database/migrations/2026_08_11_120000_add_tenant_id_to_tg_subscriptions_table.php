<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The one Telegram table that tenancy missed.
 *
 * `2026_05_26_000001_add_tenant_columns_to_core_tables` retro-fitted `tenant_id`
 * onto tg_bots, tg_bot_users, tg_messages and tg_command_logs — and skipped
 * tg_subscriptions. Every query against it therefore ran across all restaurants
 * at once, so a broadcast to "everyone subscribed to orders.ready" would reach
 * a competitor's guests.
 *
 * Backfilled from the owning bot user rather than left null, because existing
 * rows are real subscriptions that belong to somebody.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('telegram.tg_subscriptions') || Schema::hasColumn('telegram.tg_subscriptions', 'tenant_id')) {
            return;
        }

        Schema::table('telegram.tg_subscriptions', function (Blueprint $table): void {
            $table->foreignId('tenant_id')->nullable()->after('id')
                ->constrained('public.tenants')->nullOnDelete();
        });

        // The subscription's restaurant is whichever one its bot user belongs to.
        DB::table('telegram.tg_subscriptions')
            ->whereNull('tenant_id')
            ->update([
                'tenant_id' => DB::raw(
                    '(select tenant_id from telegram.tg_bot_users'
                    .' where telegram.tg_bot_users.id = telegram.tg_subscriptions.bot_user_id)',
                ),
            ]);

        Schema::table('telegram.tg_subscriptions', function (Blueprint $table): void {
            // How a broadcast actually queries this: everyone in one restaurant
            // opted into one channel.
            $table->index(['tenant_id', 'channel', 'enabled']);
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('telegram.tg_subscriptions') || ! Schema::hasColumn('telegram.tg_subscriptions', 'tenant_id')) {
            return;
        }

        Schema::table('telegram.tg_subscriptions', function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'channel', 'enabled']);
            $table->dropConstrainedForeignId('tenant_id');
        });
    }
};
