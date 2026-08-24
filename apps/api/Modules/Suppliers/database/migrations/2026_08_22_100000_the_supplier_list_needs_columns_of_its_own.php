<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The columns the supplier list draws and the table never had.
 *
 * `suppliers-server.ts` says it plainly and refused to wire the screen because
 * of it: the endpoint answered with a code, a phone number and a payment term,
 * while the design's table asks for a category, a lead time, a last delivery and
 * a quarter's spend. Four of seven columns with nothing behind them is not a
 * live screen — it is four more em dashes — so the list stayed on fixtures and
 * CLAUDE.md recorded the reason as "migratsiya kerak". This is that migration.
 *
 * ---------------------------------------------------------------------------
 * What is stored and what is not, and why the split falls where it does
 *
 * Stored: `category` and `lead_time_days`. Both are facts about the *company* —
 * a butcher is a butcher, and "next day" is what they promise. Neither can be
 * derived from anything the platform holds, and both are what a buyer filters
 * and sorts by.
 *
 * Derived, deliberately: on-time percentage, open purchase count and spend.
 * Every one of them is a fact about the *orders*, and an order that is received
 * late already says so — `expected_at` and `received_at` are both on the row.
 * A stored `on_time` column would be right on the day it was written and wrong
 * every day after, and nothing on the screen would show which. They are
 * computed in SupplierController, from the same rows the order book draws.
 *
 * `last_delivery_at` sits in between and is stored on purpose. It is derivable
 * — max(received_at) — but it is read on every row of a list that also reads
 * three aggregates, and it is written exactly once per delivery, by the one
 * call that receives one. A column here is one join fewer on a screen a buyer
 * opens all morning.
 *
 * ---------------------------------------------------------------------------
 * `unit` on the order line
 *
 * A line said "18000" and left the reader to guess grams. The ingredient knows
 * its own base unit, but a purchase order outlives the ingredient row it points
 * at — `ingredient_id` is nullable by design, "Inventory module id, no FK on
 * purpose" — so a document that cannot state its own units is a document that
 * stops meaning anything the first time a product is delisted.
 */
return new class extends Migration
{
    /**
     * What a restaurant buys, grouped the way a buyer thinks about it.
     *
     * Not an enum in the database: a constraint here means a migration every
     * time a kitchen starts buying something new, and the console already
     * validates against Supplier::CATEGORIES on the way in.
     */
    public function up(): void
    {
        Schema::table('suppliers.suppliers', function (Blueprint $table): void {
            $table->string('category', 24)->default('other')->after('name')
                ->comment('meat | poultry | dairy | produce | dry | beverages | other');

            $table->unsignedSmallInteger('lead_time_days')->default(1)->after('payment_terms_days')
                ->comment('Days from sending an order to it arriving — what the supplier promises');

            $table->datetime('last_delivery_at')->nullable()->after('rating')
                ->comment('Set by the receive call; max(received_at) kept as a column, see the note above');
        });

        Schema::table('suppliers.suppliers', function (Blueprint $table): void {
            // A buyer's first filter is "who sells meat", and the tenant scope
            // is in front of every query this application makes — so the index
            // leads with it, like every other index in this module.
            $table->index(['tenant_id', 'category']);
        });

        Schema::table('suppliers.purchase_order_items', function (Blueprint $table): void {
            $table->string('unit', 8)->nullable()->after('name')
                ->comment('The unit the quantity is counted in: g | ml | pcs');
        });
    }

    public function down(): void
    {
        Schema::table('suppliers.purchase_order_items', function (Blueprint $table): void {
            $table->dropColumn('unit');
        });

        Schema::table('suppliers.suppliers', function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'category']);
            $table->dropColumn(['category', 'lead_time_days', 'last_delivery_at']);
        });
    }
};
