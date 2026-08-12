<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The Telegram tables carry `tenant_id` and are filtered by it on every
 * single query — BelongsToTenant sees to that — but nothing indexed it.
 *
 * With 50 bots across every restaurant on the platform sharing these tables,
 * an unindexed tenant filter means each bot reply scans everyone's messages.
 *
 * Every index here leads with `tenant_id`, because the BelongsToTenant global
 * scope puts `tenant_id = ?` in front of every query the application makes. An
 * index on the foreign key alone would be the wrong shape.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('telegram.tg_bot_users', function (Blueprint $table): void {
            // Resolving the person behind an incoming update
            $table->index(['tenant_id', 'telegram_id']);
        });

        Schema::table('telegram.tg_messages', function (Blueprint $table): void {
            // The outbound queue and its delivery report
            $table->index(['tenant_id', 'status', 'created_at']);

            // Everything ever sent to one person — the first thing anyone opens
            // when a guest says "the bot never told me my order was ready".
            $table->index(['bot_user_id', 'created_at']);
        });

        Schema::table('telegram.tg_command_logs', function (Blueprint $table): void {
            // Per-restaurant bot analytics
            $table->index(['tenant_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::table('telegram.tg_command_logs', function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'created_at']);
        });

        Schema::table('telegram.tg_messages', function (Blueprint $table): void {
            $table->dropIndex(['bot_user_id', 'created_at']);
            $table->dropIndex(['tenant_id', 'status', 'created_at']);
        });

        Schema::table('telegram.tg_bot_users', function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'telegram_id']);
        });
    }
};
