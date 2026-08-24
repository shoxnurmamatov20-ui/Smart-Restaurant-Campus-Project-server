<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which Telegram chat hears about what.
 *
 * The settings screen has been drawing six event switches and a chat id since
 * the console was built, and none of them was connected to anything: the toggle
 * flipped, the chat id validated, and the manager's phone stayed silent for
 * every void, every stock-out and every shift close.
 *
 * ---------------------------------------------------------------------------
 * A rule, not a subscription
 *
 * `tg_subscriptions` already exists and is the wrong shape for this: it is
 * per-PERSON opt-in ("send ME order updates"), keyed to a `bot_user` who has
 * talked to a bot. What a restaurant wants here is the other thing — "the
 * managers' group hears every void over 100 000 so'm" — which belongs to the
 * business, names a chat rather than a person, and has to work before anybody
 * has pressed /start.
 *
 * ---------------------------------------------------------------------------
 * Why a threshold column
 *
 * A rule that fires on every void is a rule somebody mutes within a week, and a
 * muted rule is worse than no rule because everyone believes it is working.
 * `min_amount_tiyin` is what makes "tell me about the ones that matter"
 * expressible; null means all of them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('telegram.notification_rules', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->constrained('public.tenants')->cascadeOnDelete();
            /*
             * Optional: a chain with five venues wants the Chilonzor group to
             * hear about Chilonzor. Null means every branch, which is what an
             * owner's own chat wants.
             */
            $table->unsignedBigInteger('branch_id')->nullable();

            $table->string('event', 64)->comment('Domain event name: pos.bill_voided, finance.shift_closed');
            // Telegram's own id, which is negative for a group and can be
            // fifteen digits — a string, because it is an identifier and the
            // leading minus is part of it.
            $table->string('chat_id', 32);
            // Which bot speaks. Null = the restaurant's first enabled one, so
            // a venue with one bot does not have to name it on every rule.
            $table->foreignId('bot_id')->nullable()->constrained('telegram.tg_bots')->nullOnDelete();
            $table->string('locale', 8)->default('uz');
            $table->unsignedBigInteger('min_amount_tiyin')->nullable()->comment('null = every occurrence');
            $table->boolean('enabled')->default(true);
            $table->datetime('last_sent_at')->nullable();
            $table->timestamps();

            // One rule per event per chat per scope. Somebody who taps save
            // twice gets one rule, not two messages for every void thereafter.
            $table->unique(['tenant_id', 'branch_id', 'event', 'chat_id'], 'notification_rules_one_per_chat');
            $table->index(['tenant_id', 'event', 'enabled']);
        });

        RowLevelSecurity::guard('telegram.notification_rules');
    }

    public function down(): void
    {
        Schema::dropIfExists('telegram.notification_rules');
    }
};
