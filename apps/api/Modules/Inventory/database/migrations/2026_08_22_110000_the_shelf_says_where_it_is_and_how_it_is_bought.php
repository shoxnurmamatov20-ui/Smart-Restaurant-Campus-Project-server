<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Four columns the store screen draws and the ingredient row could not answer.
 *
 * `inventory-server.ts` is explicit about two of them and hard-codes `null`:
 * "No column for it yet… the API has no store dimension". The third and fourth
 * are worse than missing — they were *guessed*, from a hard-coded map of unit
 * names in the browser, which is why a case of twenty-four bottles could not be
 * expressed at all.
 *
 * ---------------------------------------------------------------------------
 * `store`: a column, not a table
 *
 * The design's chips are three fixed shelves — main, kitchen, bar — and the
 * screen filters by them. A `stores` table would be the general answer and is
 * the wrong one here: it buys a name and an id for something that is already a
 * short closed list, and it costs a join on the one query a storekeeper runs
 * all morning. When a chain wants per-venue shelves the answer is not a lookup
 * table either — it is a stock-per-location table, which the branch migration
 * already reasoned about and deliberately postponed ("per-branch stock levels
 * … need their own tables rather than a column").
 *
 * Note what is deliberately NOT added: `branch_id`. `2026_08_13_000200` names
 * inventory as belonging to the business rather than to an address, and that
 * reading has not changed. A shelf label is a place inside a venue; it is not
 * a venue.
 *
 * ---------------------------------------------------------------------------
 * `purchase_unit` and `units_per_purchase`: how a person counts it
 *
 * `unit` is and stays the *base* unit — grams, millilitres, pieces — because a
 * gram is a whole number and 4.237 kg is not, and every balance in this module
 * is an integer for that reason. What was missing is the other half: the unit a
 * storekeeper counts in and a supplier sells in, and how many base units are in
 * one of them.
 *
 * The console had been deriving both from a lookup table of unit names
 * (`g → kg, ÷1000`). That works for weight and volume and cannot express a case
 * of twenty-four bottles, a tray of thirty eggs or a sack of fifty kilos — all
 * of which are how the things in a restaurant store actually arrive.
 *
 * There is deliberately no `price_tiyin` column beside `cost_per_unit`. The
 * purchase price is `cost_per_unit × units_per_purchase` and is derived in the
 * resource. Two prices for one product is the drift `stock-ops-data.ts` already
 * warns about in as many words: "a hand-entered '70 so'm per gram' beside
 * '70 000 so'm per kg' is two numbers that will disagree the first time a price
 * changes".
 *
 * ---------------------------------------------------------------------------
 * `barcode`
 *
 * The staff app's scanner has been one decoder away from working for as long
 * as it has existed, and the missing half was never the camera — it was
 * `GET inventory/items?barcode=`, which had nothing to look in.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory.ingredients', function (Blueprint $table): void {
            $table->string('store', 16)->default('main')->after('storage')
                ->comment('main | kitchen | bar — which shelf inside the venue');

            $table->string('purchase_unit', 8)->nullable()->after('unit')
                ->comment('What a person counts and buys in: kg | l | pcs | case | sack | tray');

            $table->unsignedInteger('units_per_purchase')->default(1)->after('purchase_unit')
                ->comment('Base units in one purchase unit: 1000 g in a kg, 24 bottles in a case');

            $table->string('barcode', 32)->nullable()->after('sku')
                ->comment('EAN-13 or whatever the supplier prints; what the phone scans');
        });

        Schema::table('inventory.ingredients', function (Blueprint $table): void {
            // The chip filter's query, and it leads with tenant_id like every
            // other index here — the BelongsToTenant scope puts `tenant_id = ?`
            // in front of everything the application asks.
            $table->index(['tenant_id', 'store']);
        });

        /*
         * Unique per restaurant, and only where there is one.
         *
         * A partial index, written by hand because the fluent Blueprint has no
         * way to say WHERE. It has to be partial: most ingredients have no
         * barcode — a kitchen weighs out its own mince — and while PostgreSQL
         * would accept a plain unique index over the nulls (every NULL is
         * distinct to it), the index would then be two hundred rows of nothing
         * and would mislead the next reader into thinking it had checked
         * something.
         */
        DB::statement(
            'create unique index ingredients_tenant_id_barcode_unique'
            .' on inventory.ingredients (tenant_id, barcode) where barcode is not null',
        );
    }

    public function down(): void
    {
        DB::statement('drop index if exists inventory.ingredients_tenant_id_barcode_unique');

        Schema::table('inventory.ingredients', function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'store']);
            $table->dropColumn(['store', 'purchase_unit', 'units_per_purchase', 'barcode']);
        });
    }
};
