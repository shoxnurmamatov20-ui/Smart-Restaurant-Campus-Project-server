<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Which guest ordered it, and which bill it goes on.
 *
 * Two columns that decide whether splitting a bill works at all, and neither
 * existed. DECISIONS Q4 settled it: a line carries the seat that ordered it,
 * always, because "split this four ways" after the fact is arithmetic and
 * "which of you had the steak" is a memory nobody has by the end of the meal.
 * The design draws the seat segments on the cart for the same reason — the
 * waiter records it as they take it, which costs one tap and saves an argument.
 *
 * `bill_no` is the other half. One table can be paying on up to four bills at
 * once (a couple, a business account, somebody buying a round), and without it
 * a split has to move lines between orders — which changes what the kitchen was
 * told and loses the order's own history.
 *
 * Both default to 1 and are NOT NULL, so there is no such thing as a line
 * belonging to nobody. Existing lines are backfilled to seat 1 / bill 1, which
 * is true of every one of them: they were taken before the columns existed, on
 * one bill, and nothing about them was split.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders.order_items', function (Blueprint $table): void {
            // Nullable first, so the backfill has somewhere to write before the
            // NOT NULL goes on. Adding a NOT NULL column with a default would
            // work too and would silently stamp every existing row without the
            // statement below saying so.
            $table->unsignedSmallInteger('seat_no')->nullable()
                ->comment('Which guest at the table ordered this line (Q4)');
            $table->unsignedSmallInteger('bill_no')->nullable()
                ->comment('Which of the table\'s bills it goes on, 1-4');
        });

        DB::statement('update orders.order_items set seat_no = 1, bill_no = 1 where seat_no is null');

        Schema::table('orders.order_items', function (Blueprint $table): void {
            $table->unsignedSmallInteger('seat_no')->default(1)->nullable(false)->change();
            $table->unsignedSmallInteger('bill_no')->default(1)->nullable(false)->change();
        });

        Schema::table('orders.order_items', function (Blueprint $table): void {
            // The two reads this exists for: everything on one bill (printing a
            // pre-check) and everything for one seat (splitting by guest).
            $table->index(['order_id', 'bill_no']);
            $table->index(['order_id', 'seat_no']);
        });
    }

    public function down(): void
    {
        Schema::table('orders.order_items', function (Blueprint $table): void {
            $table->dropIndex(['order_id', 'bill_no']);
            $table->dropIndex(['order_id', 'seat_no']);
            $table->dropColumn(['seat_no', 'bill_no']);
        });
    }
};
