<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How much of each line actually came off the van.
 *
 * `purchase_order_items.quantity` is what was ORDERED, and until now that was
 * the only number a delivery had. The receiving screen draws three columns —
 * ordered, received, variance — and could fill exactly one of them; printing
 * the ordered figure under "received" would have manufactured a zero variance
 * on every line, which is the single most useful number on the screen and the
 * one a supplier's credit note is written from.
 *
 * ---------------------------------------------------------------------------
 * Nullable, and the null means something
 *
 * Not "zero arrived" and not "all of it arrived": **nobody counted**. Every
 * delivery already in the table was signed for whole, on a screen that never
 * asked, and back-filling those rows with the ordered quantity would be
 * inventing a count nobody made — a short delivery from March would become a
 * perfect one. The screen draws an em dash for a null and a real variance for a
 * number, which is the honest pair.
 *
 * The phone keeps signing for the whole document (`POST /v1/staff/actions`,
 * `receive_confirm` — a storekeeper at the service entrance with one hand
 * free), and those rows stay null too. Counting is what the desk does.
 *
 * ---------------------------------------------------------------------------
 * What it changes about stock
 *
 * `EloquentReceiving::post()` raises the shelf by the counted quantity when
 * there is one and by the ordered quantity when there is not. That is the whole
 * point of the column: two kilos of beef that never arrived must not appear on
 * the shelf, because the stock-take three weeks later is where anybody would
 * otherwise find out.
 *
 * The order's TOTAL is deliberately untouched. What is owed is what the
 * supplier invoiced, and correcting an invoice down is a credit note between
 * two businesses — not something a storekeeper's tablet decides.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('suppliers.purchase_order_items', function (Blueprint $table): void {
            $table->unsignedInteger('received_quantity')->nullable()->after('quantity')
                ->comment('Base units actually counted off the van. NULL means nobody counted');
        });
    }

    public function down(): void
    {
        Schema::table('suppliers.purchase_order_items', function (Blueprint $table): void {
            $table->dropColumn('received_quantity');
        });
    }
};
