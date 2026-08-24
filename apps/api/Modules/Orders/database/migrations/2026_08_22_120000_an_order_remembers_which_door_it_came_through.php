<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Who took the order, through which door, and for when.
 *
 * `source` already says which SOFTWARE the order came through — web, app,
 * telegram, qr, pos, aggregator — and it is written by the endpoint that
 * received it. That answers an engineering question. The console's intake desk
 * asks three others, and none of them can be derived from it:
 *
 *   **Which conversation was this?** A delivery that arrived through
 *   `source = 'aggregator'` came from Yandex, Uzum or Wolt, and those are three
 *   different contracts with three different commissions and three different
 *   people to ring when a rider does not turn up. Folded into one word they are
 *   unbillable. `intake_channel` is that word: `phone`, `telegram`, `site`,
 *   `yandex`, `uzum`, `wolt` — the six lanes the operator's screen draws.
 *
 *   **Who answered it?** The ninth role on this platform is the order operator,
 *   and the whole of their job is measured on response time. `waiter_user_id`
 *   cannot carry that: a phone order has no waiter, and the person who typed it
 *   is not the person who will carry it to a table. `operator_user_id` is a
 *   separate column for a separate person, and it is what a call-centre league
 *   table is grouped by.
 *
 *   **When did the guest ask for it?** `promised_at` is what we told them; this
 *   is what they asked for. A guest choosing 19:00 at eleven in the morning has
 *   told the kitchen something, and until now the checkout collected that answer
 *   and dropped it into free text — `placed-order.ts` says so in its own
 *   comment. `scheduled_for` is the column it was missing.
 *
 * ---------------------------------------------------------------------------
 * Why `intake_channel` is not a check constraint
 *
 * The six values are validated in `PublicOrderRequest` and `StoreOrderRequest`,
 * the same way `source`, `channel` and `status` are. A CHECK here would freeze
 * the aggregator list into DDL, and the seventh aggregator arrives as a
 * commercial agreement rather than as a migration window — see `source`, which
 * has had a free-text comment and application-side validation since it was
 * added and has never been the thing that let a bad value in.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders.orders', function (Blueprint $table): void {
            $table->string('intake_channel', 16)->nullable()
                ->comment('phone|telegram|site|yandex|uzum|wolt — which conversation, not which app');

            /*
             * The person at the intake desk, not the person carrying the tray.
             *
             * `nullOnDelete` rather than cascade: an operator who leaves the
             * restaurant must not take last quarter's orders with them. The
             * order is the record; the name on it is a reference.
             */
            $table->foreignId('operator_user_id')->nullable()
                ->constrained('public.users')->nullOnDelete();

            /*
             * What the guest asked for, as a wall-clock instant.
             *
             * Null means "as soon as you can", which is the overwhelming
             * majority and the reason this is nullable rather than defaulting to
             * `placed_at`. A column that always has a time in it cannot answer
             * "was this a pre-order", and that is the question the kitchen's
             * morning list is built from.
             */
            $table->datetime('scheduled_for')->nullable()
                ->comment('When the guest asked for it. Null = as soon as possible');
        });

        /*
         * The intake desk's own list: this lane, still open, oldest first.
         *
         * Partial on `intake_channel is not null`, because every dine-in bill
         * ever rung up on a till has none and there are far more of them than
         * there will ever be phone orders — the same argument
         * `orders_by_guest_phone` makes two migrations ago. An index that skips
         * the majority of the table is an index that stays in memory.
         */
        DB::statement(
            'create index orders_by_intake_channel on orders.orders (tenant_id, intake_channel, status)'
            .' where intake_channel is not null',
        );

        /*
         * Tomorrow's pre-orders, in the order they are wanted.
         *
         * The kitchen's morning question — "what is promised today and when" —
         * is a range scan on this and nothing else. Partial for the same reason:
         * an `asap` order is not a pre-order and must not be in the list.
         */
        DB::statement(
            'create index orders_by_schedule on orders.orders (tenant_id, scheduled_for)'
            .' where scheduled_for is not null',
        );
    }

    public function down(): void
    {
        DB::statement('drop index if exists orders.orders_by_intake_channel');
        DB::statement('drop index if exists orders.orders_by_schedule');

        Schema::table('orders.orders', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('operator_user_id');
            $table->dropColumn(['intake_channel', 'scheduled_for']);
        });
    }
};
