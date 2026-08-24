<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The stop-list, per kitchen.
 *
 * A stop-list already existed on the dish itself — `menu_items.is_available` and
 * `stopped_until` — and it is the wrong grain by one level, in the same way the
 * kitchen channel was. Manti runs out in Chilonzor; Termiz still has it and is
 * still selling it. A chain that shares one flag would take a dish off five
 * menus because one kitchen ran out of one ingredient, and the chef in Termiz
 * has no way to put it back without putting it back everywhere.
 *
 * So the two stay and mean different things:
 *
 *   `menu_items.is_available`   the business is not selling this at all — a
 *                               seasonal dish, one withdrawn by the owner.
 *   `menu_stop_list`            this kitchen is out tonight. 86.
 *
 * **Rows are closed, not deleted.** `cleared_at` rather than a delete, because
 * "what was off last Friday and who took it off" is a question a manager asks
 * about food cost and about staff, and it cannot be answered from a table that
 * throws its history away. It also makes the write idempotent to reason about:
 * one open row per dish per branch, enforced below, and clearing is an update.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('menu.menu_stop_list', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('tenant_id')->constrained('public.tenants')->cascadeOnDelete();

            /*
             * Not nullable, unlike almost every other branch column in this
             * schema. Elsewhere an absent branch means "all of them" — an owner
             * reading the whole business. Here it would have to mean "stopped
             * everywhere", which is what `menu_items.is_available` already says,
             * and two ways to express one state is how they end up disagreeing.
             */
            $table->foreignId('branch_id')->constrained('public.branches')->cascadeOnDelete();
            $table->foreignId('menu_item_id')->constrained('menu.menu_items')->cascadeOnDelete();

            /*
             * Who took it off, and why.
             *
             * Nullable both: an automatic stop from a depleted ingredient has no
             * person behind it, and a chef mid-service will not always type a
             * reason. Requiring one would mean a dish stays sellable because
             * somebody could not be bothered to explain, which is the wrong way
             * round — the stop matters more than the note about it.
             */
            $table->foreignId('stopped_by')->nullable()->constrained('public.users')->nullOnDelete();
            $table->string('reason', 200)->nullable();

            /*
             * "No more lamb until the evening delivery."
             *
             * Expires on the clock with no write behind it, which is why the menu
             * cache has a short TTL rather than relying on invalidation alone:
             * there is no event to hang it on when a dish comes back by itself.
             */
            $table->timestamp('stopped_until')->nullable();

            $table->timestamp('cleared_at')->nullable();
            $table->foreignId('cleared_by')->nullable()->constrained('public.users')->nullOnDelete();

            $table->timestamps();

            $table->index(['tenant_id', 'branch_id', 'cleared_at']);
            $table->index(['tenant_id', 'menu_item_id']);
        });

        /*
         * One open stop per dish per branch.
         *
         * A partial unique index rather than a plain one, because the closed rows
         * are the history and there will be many of them for the same dish — the
         * same Manti goes off most Fridays. Postgres is the only engine this runs
         * on (see ADR-0010), so the partial index is available and this is not a
         * portability compromise.
         *
         * It matters more than it looks: two cooks tapping the same dish at the
         * same moment on two screens is the normal case in a kitchen, and without
         * this the second tap opens a second row that the first `clear` leaves
         * behind — a dish that stays off after somebody put it back.
         */
        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX menu_stop_list_open_unique
                ON menu.menu_stop_list (tenant_id, branch_id, menu_item_id)
                WHERE cleared_at IS NULL
        SQL);

        RowLevelSecurity::guard('menu.menu_stop_list');
    }

    public function down(): void
    {
        Schema::dropIfExists('menu.menu_stop_list');
    }
};
