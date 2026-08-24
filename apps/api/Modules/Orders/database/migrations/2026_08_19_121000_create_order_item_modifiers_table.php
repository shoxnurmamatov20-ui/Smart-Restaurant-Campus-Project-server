<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What was chosen with a line, frozen at the moment it was chosen.
 *
 * The name and the price are copied here rather than read through the option id,
 * and that is the whole point of the table. A restaurant raises "extra meat"
 * from 12 000 to 14 000 next month; a receipt printed today has to keep saying
 * 12 000 forever, and a kitchen ticket reprinted after the change has to keep
 * saying what the guest actually asked for. Reading live through a foreign key
 * would quietly rewrite both — the same reasoning that already denormalises
 * `sku` and `title` onto the line itself, and `table_label` onto the order.
 *
 * `modifier_option_id` stays alongside, without a foreign key. It is for
 * analytics ("how often is doneness asked for") and it must not be able to stop
 * a menu tidy-up: deleting a retired option cannot be allowed to fail because a
 * receipt from March mentions it.
 *
 * It carries its own `tenant_id` even though its parent line already has one,
 * and that is not reflex. Row-level security scopes a table by the column ON
 * that table: a child row that could only be scoped by joining upwards is a row
 * the policy cannot guard, so a raw `select * from order_item_modifiers` in some
 * future report would read every restaurant's.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders.order_item_modifiers', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            $table->foreignId('order_item_id')->constrained('orders.order_items')->cascadeOnDelete();

            // No FK: a retired option must stay deletable. See the class note.
            $table->unsignedBigInteger('modifier_option_id')->nullable()
                ->comment('menu.modifier_options — no FK, so a menu tidy-up cannot fail');
            $table->unsignedBigInteger('modifier_group_id')->nullable();

            // The snapshot. jsonb because the name is guest-facing in three
            // languages, like the option it was copied from.
            $table->jsonb('name');
            $table->jsonb('group_name')->nullable();

            // What it added at the time, per unit of the line, in tiyin.
            $table->bigInteger('price_delta')->default(0);

            $table->timestamps();

            $table->index(['tenant_id', 'order_item_id']);
            $table->index(['tenant_id', 'modifier_option_id']);
        });

        // The sweep in 2026_08_18_170000 only covered tables that existed then.
        RowLevelSecurity::guard('orders.order_item_modifiers');
    }

    public function down(): void
    {
        Schema::dropIfExists('orders.order_item_modifiers');
    }
};
