<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The five switches on the intake screen's channels tab, given somewhere to write.
 *
 * `calls-panels.tsx` states the problem exactly and it is worth repeating,
 * because it is the reason this is a table and not a settings key:
 *
 *   *"`PATCH /settings` has a `channels` array and it is the wrong list. Its
 *   values are the four FULFILMENT channels an order row can hold — `dine_in`,
 *   `takeaway`, `delivery`, `aggregator` — while these five switches are intake
 *   SOURCES: the telephone, the bot, the website, Yandex Eats and Uzum Tezkor.
 *   Two of the five would write the same value (`aggregator`) and one (`tel`)
 *   has none at all, so switching Uzum off would take Yandex with it and
 *   switching the phone off would do nothing."*
 *
 * ---------------------------------------------------------------------------
 * Why a table rather than a sixth key on `tenants.settings`
 *
 * Because a pause has a clock and a reason, and a settings document has neither.
 * "We are not taking website orders for the next forty minutes, the fryer is
 * down" is the thing an operator actually does at eight on a Friday — and the
 * next thing they do is forget. `paused_until` is what puts the door back on
 * its own, and `pause_reason` is what the person on the next shift reads
 * instead of ringing to ask.
 *
 * It is also per venue. One branch's kitchen being under water is not a reason
 * for the other four to stop taking web orders, and `tenants.settings` is one
 * document for the whole business. A null `branch_id` is the platform's usual
 * roll-up and means "everywhere" — which is what an owner switching a channel
 * off means, and what a chain with one venue always means.
 *
 * ---------------------------------------------------------------------------
 * Two columns, not one, and the difference is real
 *
 * `is_open = false` is a decision: we do not sell through Uzum. `paused_until`
 * is a Friday: we do, but not for the next hour. Folding them into one flag
 * would mean an hour's pause and a cancelled contract look identical on the
 * screen, and somebody would switch the contract back on by accident while
 * trying to reopen after a rush.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders.channel_settings', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->cascadeOnDelete();
            $table->string('key', 16)->comment('tel | tg | web | ye | uz — the console\'s own keys');
            $table->boolean('is_open')->default(true)->comment('A decision: do we sell through this door at all');
            $table->datetime('paused_until')->nullable()->comment('A Friday: we do, but not for the next hour');
            $table->string('pause_reason', 200)->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('public.users')->nullOnDelete();
            $table->timestamps();

            /*
             * Uniqueness in two halves, because PostgreSQL does not think two
             * NULLs are equal — the same shape `analytics.daily_facts` needed
             * and for the same reason. Without the second index the roll-up
             * rows, which are exactly the ones a second write would duplicate,
             * would be constrained by nothing.
             */
            $table->unique(['tenant_id', 'branch_id', 'key'], 'channel_settings_one_per_venue');
            $table->index(['tenant_id', 'key']);
        });

        DB::statement(
            'create unique index channel_settings_one_per_business'
            .' on orders.channel_settings (tenant_id, "key") where branch_id is null',
        );

        RowLevelSecurity::guard('orders.channel_settings');
    }

    public function down(): void
    {
        Schema::dropIfExists('orders.channel_settings');
    }
};
