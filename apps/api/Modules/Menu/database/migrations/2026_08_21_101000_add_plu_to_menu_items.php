<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The tax authority's code for a dish — one column, and it is P11's last gap.
 *
 * ---------------------------------------------------------------------------
 * What this is, and why `sku` cannot do it
 *
 * `sku` is the restaurant's own handle: `OSH-001`, printed on a kitchen docket,
 * chosen by whoever set the menu up. The PLU here is not that. It is the
 * classification code from the national catalogue (IKPU / ИКПУ) that a fiscal
 * receipt has to carry per line — the state's identifier for "a portion of
 * plov", the same on every menu in the country, and the thing an inspector
 * matches a declaration against.
 *
 * Two restaurants selling plov have two different SKUs and the same PLU. That
 * sentence is the whole reason this is a separate column: overloading `sku`
 * would make the fiscal declaration depend on how one kitchen happens to name
 * its own dishes, and a receipt that classified plov as pizza is wrong in a way
 * an audit finds.
 *
 * ---------------------------------------------------------------------------
 * Nullable, and it stays nullable
 *
 * A restaurant sets its codes up with its accountant, dish by dish, over a
 * week — and it sells food the whole time. A NOT NULL column would mean either
 * a fake code on every existing dish (worse than none: it declares something
 * specific and wrong) or a menu that cannot be edited until the accountant is
 * finished.
 *
 * So the driver's rule is: send the line codes it has, and file a total-only
 * declaration when it has none. `FiscalDocument::$lines` already models exactly
 * that distinction — empty is legal, and several operators accept it.
 *
 * Added by the Finance work rather than by a Menu change, because Finance is
 * what needs it and the column is inert until a fiscal driver reads it. One
 * column, no index: nothing looks a dish up by its PLU, it is only ever read
 * alongside a line that has already been found.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('menu.menu_items', function (Blueprint $table): void {
            $table->string('plu', 32)->nullable()->after('sku')
                ->comment('National classification code (IKPU) for the fiscal receipt — not the SKU');
        });
    }

    public function down(): void
    {
        Schema::table('menu.menu_items', function (Blueprint $table): void {
            $table->dropColumn('plu');
        });
    }
};
