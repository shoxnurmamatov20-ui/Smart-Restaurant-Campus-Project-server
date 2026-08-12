<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // tg_bots - registered Telegram bots (one row per bot)
        Schema::create('telegram.tg_bots', function (Blueprint $table): void {
            $table->id();
            $table->string('key', 64)->unique()->comment('matches registry key, e.g. "guest"');
            $table->string('telegram_username', 64)->nullable()->comment('@OshMarkaziGuestBot');
            $table->string('name_uz');
            $table->string('name_ru');
            $table->string('name_en');
            $table->string('purpose');
            $table->string('audience', 32);
            $table->string('module', 32)->nullable();
            $table->string('phase', 16)->default('phase-1');
            $table->json('commands')->nullable();
            $table->boolean('enabled')->default(false);
            $table->boolean('requires_phone')->default(true);
            $table->boolean('requires_login')->default(true);
            $table->text('encrypted_token')->nullable()->comment('Bot token, encrypted via APP_KEY');
            $table->string('webhook_secret', 128)->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['enabled', 'audience']);
            $table->index('module');
        });

        // tg_bot_users - Telegram user ↔ platform user linking, per bot
        Schema::create('telegram.tg_bot_users', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('bot_id')->constrained('telegram.tg_bots')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('public.users')->nullOnDelete();
            $table->bigInteger('telegram_id')->comment('Telegram user id');
            $table->string('telegram_username', 64)->nullable();
            $table->string('phone', 32)->nullable();
            $table->string('full_name')->nullable();
            $table->string('locale', 8)->default('uz');
            $table->boolean('blocked_bot')->default(false)->comment('True if user blocked the bot');
            $table->json('preferences')->nullable();
            $table->timestamp('linked_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();

            $table->unique(['bot_id', 'telegram_id']);
            $table->index(['bot_id', 'user_id']);
            $table->index(['user_id']);
        });

        // tg_subscriptions - opt-in channels per user (e.g. "orders.ready")
        Schema::create('telegram.tg_subscriptions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('bot_user_id')->constrained('telegram.tg_bot_users')->cascadeOnDelete();
            $table->string('channel', 64)->comment('e.g. "orders.ready", "orders.delayed"');
            $table->boolean('enabled')->default(true);
            $table->json('settings')->nullable();
            $table->timestamps();

            $table->unique(['bot_user_id', 'channel']);
            $table->index('channel');
        });

        // tg_messages - outbound message audit log (Laravel -> bot)
        Schema::create('telegram.tg_messages', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('bot_id')->constrained('telegram.tg_bots')->cascadeOnDelete();
            $table->foreignId('bot_user_id')->nullable()->constrained('telegram.tg_bot_users')->nullOnDelete();
            $table->bigInteger('telegram_chat_id');
            $table->bigInteger('telegram_message_id')->nullable();
            $table->text('text');
            $table->string('channel', 64)->nullable()->comment('e.g. "orders.ready"');
            $table->string('status', 16)->default('queued')->comment('queued|sent|failed');
            $table->text('error')->nullable();
            $table->json('payload')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();

            $table->index(['bot_id', 'status', 'created_at']);
            $table->index(['telegram_chat_id', 'sent_at']);
        });

        // tg_command_logs - analytics: which command, who, when, latency
        Schema::create('telegram.tg_command_logs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('bot_id')->constrained('telegram.tg_bots')->cascadeOnDelete();
            $table->bigInteger('telegram_id');
            $table->foreignId('user_id')->nullable()->constrained('public.users')->nullOnDelete();
            $table->string('command', 64);
            $table->string('chat_type', 16)->default('private');
            $table->unsignedInteger('latency_ms')->default(0);
            $table->boolean('ok')->default(true);
            $table->text('error')->nullable();
            $table->timestamps();

            $table->index(['bot_id', 'command', 'created_at']);
            $table->index(['bot_id', 'telegram_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('telegram.tg_command_logs');
        Schema::dropIfExists('telegram.tg_messages');
        Schema::dropIfExists('telegram.tg_subscriptions');
        Schema::dropIfExists('telegram.tg_bot_users');
        Schema::dropIfExists('telegram.tg_bots');
    }
};
