<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which waiter is looking after this table.
 *
 * `tables.restaurant_tables` has carried a `status` since the first migration
 * and nothing else about the person: `occupied` said the room was full and
 * never said whose section it was. Three screens were already asking —
 * `POST /api/v1/staff/actions` carries a `table_claim` verb the waiter's phone
 * queues offline, the waiter dashboard draws "mening stollarim", and the floor
 * map colours a section by its waiter — and all three were answering from the
 * open bill instead, which is wrong twice over: a table claimed before anybody
 * ordered has no bill yet, and a bill transferred to another waiter for
 * settlement does not move the section.
 *
 * ---------------------------------------------------------------------------
 * A user id with no foreign key, on purpose
 *
 * `public.users` is core and this is a module schema, so a constraint would be
 * fine here — but the column is cleared rather than cascaded when somebody
 * leaves: a table held by a waiter whose account was deleted must become free,
 * not disappear. Nulling on delete would do that, and it is what
 * `acknowledged_by_user_id` on `tables.waiter_calls` already does not do, for
 * the same reason it does not: the claim is a fact about the last ten minutes,
 * not a record anybody audits. Kept plain and released by `release()`.
 *
 * No row-level-security statements: the table already carries `tenant_id` and
 * was guarded when the policy migration swept the schema. Adding a column does
 * not change that, and re-running `RowLevelSecurity::guard()` here would drop
 * and recreate a policy this migration has no opinion about.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tables.restaurant_tables', function (Blueprint $table): void {
            $table->unsignedBigInteger('claimed_by_user_id')->nullable()
                ->comment('The waiter who took this table — no FK, see the migration note');
            $table->datetime('claimed_at')->nullable();
        });

        /*
         * "Whose tables are these" — the waiter dashboard's only query.
         *
         * Partial, because the answer is never about the ninety per cent of
         * rows nobody has claimed, and a full index on a mostly-null column is
         * an index PostgreSQL reads past.
         */
        Schema::table('tables.restaurant_tables', function (Blueprint $table): void {
            $table->index(['tenant_id', 'claimed_by_user_id'], 'restaurant_tables_by_claimer');
        });
    }

    public function down(): void
    {
        Schema::table('tables.restaurant_tables', function (Blueprint $table): void {
            $table->dropIndex('restaurant_tables_by_claimer');
            $table->dropColumn(['claimed_by_user_id', 'claimed_at']);
        });
    }
};
