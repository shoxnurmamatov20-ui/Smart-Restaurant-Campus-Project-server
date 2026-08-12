<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Guest history, joined from the other direction.
 *
 * Loyalty and feedback were indexed by customer only where the ledger needed
 * it; tracing back from a bill — "which guest complained about this order?" —
 * had nothing.
 *
 * Every index here leads with `tenant_id`, because the BelongsToTenant global
 * scope puts `tenant_id = ?` in front of every query the application makes. An
 * index on the foreign key alone would be the wrong shape.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('crm.loyalty_transactions', function (Blueprint $table): void {
            // Points earned on one specific bill
            $table->index(['tenant_id', 'order_id']);
        });

        Schema::table('crm.feedbacks', function (Blueprint $table): void {
            // Everything this guest has ever said
            $table->index(['tenant_id', 'customer_id']);
        });

        Schema::table('crm.feedbacks', function (Blueprint $table): void {
            // "Which order was this complaint about?"
            $table->index(['tenant_id', 'order_id']);
        });
    }

    public function down(): void
    {
        Schema::table('crm.feedbacks', function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'order_id']);
        });

        Schema::table('crm.feedbacks', function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'customer_id']);
        });

        Schema::table('crm.loyalty_transactions', function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'order_id']);
        });
    }
};
