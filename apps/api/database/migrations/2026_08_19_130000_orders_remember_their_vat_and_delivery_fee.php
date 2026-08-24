<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The two money columns a receipt needs and the table did not have.
 *
 * `vat_included` is not a charge — it is a statement about the total, because
 * Uzbek menu prices already contain 12% (Q1). It is stored rather than computed
 * on read for one reason: the rate can change. A bill settled at 12% must keep
 * saying 12% forever, and a bill reprinted after a rate change has to reconcile
 * against the fiscal receipt that was registered on the night. Recomputing from
 * today's rate would quietly rewrite last year's books.
 *
 * `delivery_fee` sits outside the VAT base — it is transport billed on, not part
 * of the food supply — and it is a column rather than a line so that a courier's
 * fee never lands on a kitchen ticket.
 *
 * Both default to 0, which is true of every existing row: 25 dine-in orders with
 * nothing delivered and no VAT ever recorded.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders.orders', function (Blueprint $table): void {
            $table->unsignedBigInteger('vat_included')->default(0)
                ->after('service_charge')
                ->comment('Tiyin already inside `total`, not added to it (Q1)');

            $table->unsignedBigInteger('delivery_fee')->default(0)
                ->after('vat_included')
                ->comment('Tiyin, outside the VAT base');
        });
    }

    public function down(): void
    {
        Schema::table('orders.orders', function (Blueprint $table): void {
            $table->dropColumn(['vat_included', 'delivery_fee']);
        });
    }
};
