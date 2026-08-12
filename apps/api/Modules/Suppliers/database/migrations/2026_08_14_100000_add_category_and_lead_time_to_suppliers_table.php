<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Two things a storekeeper sorts suppliers by, and neither was stored.
 *
 * The design's supplier list has seven columns. Five could already be answered
 * — the name, the contact, and the three figures that fall out of the purchase
 * orders: how much has been spent, how many orders are open, and how many
 * arrived when they said they would. Two could not, because nothing recorded
 * them:
 *
 * - **What they sell.** A storekeeper chasing a meat delivery does not want to
 *   read past the beverage suppliers. It is one field and it is the first
 *   filter on the screen.
 * - **How long they take.** Lead time is what turns "we are low on beef" into
 *   "order beef today", and it belongs to the supplier rather than to any one
 *   order: it is what the buyer expects before an order exists.
 *
 * Both nullable. A restaurant importing its supplier list has a name and a
 * phone number; making either of these required would block the import to
 * satisfy a screen.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('suppliers.suppliers', function (Blueprint $table): void {
            $table->string('category', 32)->nullable()->after('name')
                ->comment('meat, produce, dairy, dry, beverages, poultry, other');

            // Days from order to delivery. Small integer: a supplier quoting
            // more than a working week is not a supplier a kitchen uses for
            // anything perishable.
            $table->unsignedTinyInteger('lead_time_days')->nullable()->after('payment_terms_days');

            // The screen's first filter is the category, scoped to the
            // restaurant like every other query in this platform.
            $table->index(['tenant_id', 'category']);
        });
    }

    public function down(): void
    {
        Schema::table('suppliers.suppliers', function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'category']);
            $table->dropColumn(['category', 'lead_time_days']);
        });
    }
};
