<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * When a supplier's invoice was actually settled.
 *
 * `suppliers.purchase_orders` carried `id, tenant_id, supplier_id, number,
 * status, expected_at, received_at, total, note` — and its status ladder is
 * draft → sent → confirmed → received, which is DELIVERY and not money. So the
 * payables table on the ledger screen could show what was owed and had no way to
 * record that any of it had been paid: the button was drawn, it flashed a
 * message, and the row still read unpaid tomorrow.
 *
 * ---------------------------------------------------------------------------
 * Two columns rather than a status
 *
 * A `payment_status` enum would have been a second ladder running beside the
 * delivery one, and the two do not move together: an order can be paid before it
 * arrives (a deposit on a van of meat) and arrive months before it is paid
 * (thirty-day terms). Dates and amounts say all of it without either ladder
 * having to know about the other.
 *
 * `paid_amount` because part payment is real: a restaurant short of cash pays
 * half on Friday and half the following week, and a boolean would have forced
 * that into either "paid" — which is a lie the supplier will correct — or
 * "unpaid", which loses the money that did move.
 *
 * ---------------------------------------------------------------------------
 * The debt is the other half, and it lives on the supplier
 *
 * `suppliers.suppliers.debt` was grown by `EloquentReceiving::post()` when the
 * supplier gives terms, and NOTHING could shrink it — the column is absent from
 * `UpdateSupplierRequest`, so no endpoint could decrement it. A payables screen
 * whose totals only ever go up is a screen an accountant stops opening. The pay
 * endpoint writes both in one transaction: the invoice's own record, and the
 * running balance the supplier list is sorted by.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('suppliers.purchase_orders', function (Blueprint $table): void {
            $table->unsignedBigInteger('paid_amount')->default(0)->after('total')
                ->comment('Settled so far, in tiyin — part payments are real');
            $table->datetime('paid_at')->nullable()->after('paid_amount')
                ->comment('When it was settled in full; null while anything is outstanding');

            /*
             * "What do we still owe, oldest first" — the payables screen's own
             * query, and the only one that reads these two columns.
             *
             * `paid_at` leads because the filter is on it: an index ordered
             * by the date first would have to be scanned in full to find the
             * nulls, which are precisely the rows the screen is about.
             */
            $table->index(['tenant_id', 'paid_at', 'expected_at'], 'purchase_orders_payables');
        });
    }

    public function down(): void
    {
        Schema::table('suppliers.purchase_orders', function (Blueprint $table): void {
            $table->dropIndex('purchase_orders_payables');
            $table->dropColumn(['paid_amount', 'paid_at']);
        });
    }
};
