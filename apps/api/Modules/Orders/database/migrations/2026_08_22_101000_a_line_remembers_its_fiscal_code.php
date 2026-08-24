<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The classification code a receipt is filed under, frozen onto the line.
 *
 * `menu.menu_items.plu` already holds the IKPU code — the national category a
 * dish is sold as, which is the tax authority's word rather than the
 * restaurant's. The fiscal driver needs it per line, and reading it from the
 * catalogue at filing time would be wrong in the one way that matters here: a
 * dish reclassified in March would rewrite what February's receipts declared,
 * and the authority is holding the February version.
 *
 * So it joins `sku`, `title` and `station` on the line — the snapshot rule this
 * table has followed since it was created, for exactly this reason: what was
 * sold is not a question the catalogue can answer next month.
 *
 * Nullable, and null on most rows forever. Most of what is on a menu has never
 * been classified, several fiscal providers take a total-only declaration and
 * never ask, and a line refused because nobody had typed a twelve-digit code
 * would be a dish that cannot be sold.
 *
 * No index: nothing is ever looked up by PLU. It is read alongside a line that
 * has already been found, exactly as the Menu column is.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders.order_items', function (Blueprint $table): void {
            $table->string('plu', 32)->nullable()->after('sku')
                ->comment('National classification code (IKPU), snapshotted from the dish at sale time');
        });
    }

    public function down(): void
    {
        Schema::table('orders.order_items', function (Blueprint $table): void {
            $table->dropColumn('plu');
        });
    }
};
