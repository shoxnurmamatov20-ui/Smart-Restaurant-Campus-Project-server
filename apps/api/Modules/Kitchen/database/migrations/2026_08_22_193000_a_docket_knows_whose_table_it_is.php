<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The waiter, on the docket.
 *
 * A KDS card names a table and a station and — until now — nothing about who is
 * waiting for it. That is the one fact the pass actually shouts: a plate under
 * the heat lamp is not "table 12's", it is "Dilnoza's", because Dilnoza is the
 * person who will come and take it. `kds-server.ts` drew "—" in that column and
 * said why: "the ticket carries no waiter. The order it came from does".
 *
 * Denormalised on purpose, like `table_label` and `lines` beside it. Kitchen may
 * not read `orders.orders` — that is the module boundary the `TicketWriter`
 * contract exists to hold — and a docket is a snapshot in any case: reassigning
 * a table's section an hour later must not rewrite the paper already on the pass.
 *
 * Nullable because most of the platform's bills have no waiter at all: a
 * takeaway ordered from a phone and an aggregator ticket are nobody's table.
 * There is no foreign key for the same reason `order_id` has none — `public.users`
 * is core and reachable, but a docket that outlives a deleted account is still
 * a true record of what was cooked.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('kitchen.kitchen_tickets', function (Blueprint $table): void {
            $table->unsignedBigInteger('waiter_user_id')
                ->nullable()
                ->after('table_label')
                ->comment('public.users id, snapshot at fire time, no FK on purpose');
        });
    }

    public function down(): void
    {
        Schema::table('kitchen.kitchen_tickets', function (Blueprint $table): void {
            $table->dropColumn('waiter_user_id');
        });
    }
};
