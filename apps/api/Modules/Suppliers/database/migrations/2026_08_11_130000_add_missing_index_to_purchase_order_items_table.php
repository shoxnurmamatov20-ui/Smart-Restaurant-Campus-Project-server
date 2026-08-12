<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Receiving a delivery resolves each line to an ingredient, and purchase
 * history per ingredient is how a chef argues about a price rise.
 *
 * Every index here leads with `tenant_id`, because the BelongsToTenant global
 * scope puts `tenant_id = ?` in front of every query the application makes. An
 * index on the foreign key alone would be the wrong shape.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('suppliers.purchase_order_items', function (Blueprint $table): void {
            // "What have we paid for this ingredient, and to whom?"
            $table->index(['tenant_id', 'ingredient_id']);
        });
    }

    public function down(): void
    {
        Schema::table('suppliers.purchase_order_items', function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'ingredient_id']);
        });
    }
};
