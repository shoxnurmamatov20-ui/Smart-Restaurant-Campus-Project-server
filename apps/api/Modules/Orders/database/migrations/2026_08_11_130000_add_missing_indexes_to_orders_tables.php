<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Joins and filters the POS and CRM run constantly that had no index.
 *
 * Every one of these is a sequential scan today. On a venue doing 300 bills a
 * day that is invisible; on a chain with a year of history it is the difference
 * between a dashboard that loads and one that times out.
 *
 * Every index here leads with `tenant_id`, because the BelongsToTenant global
 * scope puts `tenant_id = ?` in front of every query the application makes. An
 * index on the foreign key alone would be the wrong shape.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders.orders', function (Blueprint $table): void {
            // "Bu mehmonning oldingi buyurtmalari" — CRM guest card
            $table->index(['tenant_id', 'customer_id']);
        });

        Schema::table('orders.orders', function (Blueprint $table): void {
            // A waiter's own bills, and their share of service charge
            $table->index(['tenant_id', 'waiter_user_id']);
        });

        Schema::table('orders.orders', function (Blueprint $table): void {
            // Today's takings: the single most-run analytics query
            $table->index(['tenant_id', 'status', 'closed_at']);
        });

        Schema::table('orders.order_items', function (Blueprint $table): void {
            // ABC analysis groups sales by dish
            $table->index(['tenant_id', 'menu_item_id']);
        });
    }

    public function down(): void
    {
        Schema::table('orders.order_items', function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'menu_item_id']);
        });

        Schema::table('orders.orders', function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'status', 'closed_at']);
        });

        Schema::table('orders.orders', function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'waiter_user_id']);
        });

        Schema::table('orders.orders', function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'customer_id']);
        });
    }
};
