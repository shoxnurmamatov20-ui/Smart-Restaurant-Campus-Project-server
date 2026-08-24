<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Who is carrying this order, and how far they have got.
 *
 * `PublicOrderController::trackingPayload()` has answered `'courier' => null`
 * for every delivery since it was written, and said so in its own comment:
 * *"A dispatch module does not exist — nothing on this platform assigns a rider
 * or reads a scooter's position."* This is the smallest table that makes that
 * key mean something, and it is deliberately the smallest: dispatch is a
 * product of its own — zones, batching, pay per drop, a rider app — and none of
 * that is what a guest watching a tracking screen is missing.
 *
 * What they are missing is three sentences: somebody has it, here is their
 * name, they left at 19:12.
 *
 * ---------------------------------------------------------------------------
 * One row per order, not per assignment
 *
 * A reassignment overwrites `courier_user_id` rather than opening a second row.
 * The tempting shape is an assignment log — it answers "who dropped this order
 * twice" — and it costs the one question the screen actually asks, "who has it
 * NOW", which becomes a sort over a history on every render. The handover is
 * still recorded: `LogsActivity` on the model writes the old and new rider into
 * `activity_log`, which is where every other reassignment on this platform is
 * already looked up.
 *
 * ---------------------------------------------------------------------------
 * Timestamps, not a status enum alone
 *
 * `assigned_at`, `picked_at`, `delivered_at` are the three facts. `status` is
 * derived from them and stored anyway, because the console filters on it and a
 * filter over three nullable timestamps is three OR'd IS NULL tests that no
 * index helps. The pair cannot drift — `Delivery::advance()` is the only writer
 * and sets both.
 *
 * The position is `last_lat`/`last_lng` and NOT a track. A breadcrumb trail of
 * a named employee's movements is surveillance with a retention policy
 * attached, and nothing on any screen in this repo draws a path — the guest map
 * draws one pin. One pin is what is stored.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders.deliveries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            /*
             * A drop happens at an address — CLAUDE.md's third rule. It is also
             * what the dispatcher's screen is scoped by: a manager in Chilonzor
             * assigns Chilonzor's riders, and a delivery with no branch would
             * appear on every venue's board at once.
             */
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->nullOnDelete();

            /*
             * The bill, with no foreign key.
             *
             * Same schema, so a constraint would work — and it is left off to
             * match `tables.waiter_calls.order_id` and `orders.restaurant_table_id`:
             * a bill is soft-deleted and this row must survive it, because
             * "which orders did this rider carry last Tuesday" is a payroll
             * question and a deleted bill is still a trip somebody made.
             */
            $table->unsignedBigInteger('order_id');

            /*
             * The rider. A platform user with the `courier` role, not a Staff
             * member id: Orders may not read Staff, and the role already exists
             * in `RolesAndPermissionsSeeder`. Nullable so an order can be
             * queued for dispatch before anybody is free.
             */
            $table->unsignedBigInteger('courier_user_id')->nullable();

            $table->string('status', 16)->default('assigned')
                ->comment('assigned|picked|enroute|delivered|failed');

            $table->datetime('assigned_at')->nullable();
            $table->datetime('picked_at')->nullable();
            $table->datetime('delivered_at')->nullable();

            // One pin, not a path. See the migration note.
            $table->decimal('last_lat', 10, 7)->nullable();
            $table->decimal('last_lng', 10, 7)->nullable();
            $table->datetime('last_seen_at')->nullable();

            $table->string('note', 255)->nullable()
                ->comment('Why a drop failed, when one does');

            $table->timestamps();

            /*
             * "What is this rider carrying" — the dispatch board's row query,
             * and the one the courier's own phone asks on every refresh.
             */
            $table->index(['tenant_id', 'courier_user_id', 'status']);

            // "What is still out of this venue", oldest first.
            $table->index(['tenant_id', 'branch_id', 'status', 'id']);
        });

        /*
         * One live delivery per order.
         *
         * A double-tapped "biriktirish" on a slow connection is two requests
         * that both read "no row" before either writes, and two rows would put
         * one dinner on two riders' boards. The partial index is what makes the
         * application's check hold under that race; a finished delivery is
         * excluded so a redelivery after a failure can open a fresh row.
         */
        DB::statement(
            'create unique index deliveries_one_live_per_order'
            .' on orders.deliveries (tenant_id, order_id)'
            ." where status in ('assigned', 'picked', 'enroute')",
        );

        RowLevelSecurity::guard('orders.deliveries');
    }

    public function down(): void
    {
        // Dropping the table takes its indexes and its policy with it.
        Schema::dropIfExists('orders.deliveries');
    }
};
