<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Two things a guest sitting at a table can do without a waiter walking past.
 *
 * "Ofitsiantni chaqirish" and "Hisobni so'rash" are the two buttons on the QR
 * screen the design draws, and until now both were honest about doing nothing:
 * the web one says so in its own comment — *"the guest's intent is recorded on
 * their own screen and the waiter is still fetched by hand."* This is the table
 * that makes them mean something.
 *
 * ---------------------------------------------------------------------------
 * One table for both, not two
 *
 * A call for a waiter and a request for the bill are the same shape — a table
 * raised its hand at a moment, somebody has to notice, and somebody eventually
 * did. What differs is one word, so it is one column. Two tables would be two
 * queries on the floor screen and two places for "acknowledged" to drift.
 *
 * ---------------------------------------------------------------------------
 * Why `qr_token` becomes unique and non-guessable here
 *
 * The column has existed since the first Tables migration, nullable, unindexed
 * and unenforced — a decoration on a menu link. It is about to become the ONLY
 * credential a stranger presents to add food to a real bill, so:
 *
 *   **Unique across the platform**, or two tables share a token and a guest's
 *   order lands wherever the query happened to sort. Not per restaurant — see
 *   the index below for why the weaker version is genuinely weaker.
 *
 *   **Backfilled**, because a null token on a live table is a table nobody can
 *   scan into, and the seeder only fills the rows it created.
 *
 * It is deliberately NOT the table id. An id is a small integer, and a small
 * integer in a URL is an invitation to type the next one — which, on an
 * endpoint that adds lines to bills, is a stranger ordering forty kebabs onto
 * somebody else's table from the car park.
 */
return new class extends Migration
{
    public function up(): void
    {
        /*
         * Every table gets a token, including the ones that predate this.
         *
         * `md5(random() || id)` rather than a PHP loop: the backfill has to work
         * on a table with fifty thousand rows in it and on a fresh install with
         * none, and one statement does both. Randomness is what is wanted here
         * — this is the one value in the schema that must not be derivable from
         * anything a guest can see.
         */
        DB::statement(
            'update tables.restaurant_tables set qr_token = md5(random()::text || id::text || clock_timestamp()::text)'
            .' where qr_token is null',
        );

        /*
         * Platform-wide, not per restaurant.
         *
         * The tempting version is `(tenant_id, qr_token)`, and it is the weaker
         * one: a token is a bearer credential that arrives from a camera pointed
         * at a sticker, and the request that carries it also names a restaurant.
         * If two restaurants could hold the same token, then a mismatch between
         * the two halves would be a collision rather than a 404 — and the
         * property worth having is that a token names at most one table on the
         * whole platform.
         *
         * Cross-tenant reads are still refused, by the global scope on the model
         * rather than by this index. See `RestaurantTable::findByQrToken()`.
         */
        DB::statement(
            'create unique index restaurant_tables_qr_token_unique'
            .' on tables.restaurant_tables (qr_token) where qr_token is not null',
        );

        Schema::create('tables.waiter_calls', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            /*
             * A raised hand happens at an address — CLAUDE.md's third rule. It
             * is also what the floor channel is keyed on: `branch.{id}.floor`
             * carries this to the handsets in one building, and a call with no
             * branch would be broadcast to a channel that does not exist.
             */
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->nullOnDelete();
            $table->foreignId('restaurant_table_id')->constrained('tables.restaurant_tables')->cascadeOnDelete();

            $table->string('kind', 16)->comment('waiter|bill — what the guest asked for');
            $table->string('status', 16)->default('open')->comment('open|acknowledged|done|expired');

            /*
             * The bill the request is about, when there is one.
             *
             * Cross-module id with no foreign key, the same way `orders` stores
             * `restaurant_table_id`: Orders lives in another schema and a
             * constraint across the two would be a module boundary written in
             * DDL. Null for "waiter, please" — that is about the table, not
             * about money.
             */
            $table->unsignedBigInteger('order_id')->nullable();

            $table->unsignedTinyInteger('seat_no')->nullable()
                ->comment('Which chair asked, when the QR screen knows');
            $table->string('note', 255)->nullable();

            $table->unsignedBigInteger('acknowledged_by_user_id')->nullable();
            $table->datetime('acknowledged_at')->nullable();
            $table->datetime('closed_at')->nullable();
            $table->timestamps();

            /*
             * The floor screen's only query: what is still open here, oldest
             * first — because the table that has been waiting longest is the one
             * that matters, and a list sorted any other way teaches a waiter to
             * serve whoever asked most recently.
             */
            $table->index(['tenant_id', 'branch_id', 'status', 'id']);
            $table->index(['tenant_id', 'restaurant_table_id', 'status']);
        });

        /*
         * One open call per table per kind.
         *
         * A guest who taps "chaqirish" four times because nobody came has not
         * asked four times — they have asked once, louder. Four rows would show
         * the floor four tables' worth of work and would make the oldest-first
         * sort meaningless. The application returns the existing row; this is
         * what makes that true under a double-tap on a slow connection, where
         * both requests read "none open" before either writes.
         */
        DB::statement(
            'create unique index waiter_calls_one_open_per_table'
            .' on tables.waiter_calls (tenant_id, restaurant_table_id, kind)'
            ." where status in ('open', 'acknowledged')",
        );

        RowLevelSecurity::guard('tables.waiter_calls');
    }

    public function down(): void
    {
        // Dropping the table takes its indexes and its policy with it.
        Schema::dropIfExists('tables.waiter_calls');

        DB::statement('drop index if exists tables.restaurant_tables_qr_token_unique');
    }
};
