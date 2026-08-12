<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('suppliers.purchase_order_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('purchase_order_id')->constrained('suppliers.purchase_orders')->cascadeOnDelete();
            $table->unsignedBigInteger('ingredient_id')->nullable()->comment('Inventory module id, no FK on purpose');
            $table->string('name', 160);
            $table->integer('quantity')->default(0);
            $table->unsignedBigInteger('unit_price')->default(0)->comment('Amount in tiyin (1 UZS = 100 tiyin)');
            $table->unsignedBigInteger('total_price')->default(0)->comment('Amount in tiyin (1 UZS = 100 tiyin)');
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'purchase_order_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('suppliers.purchase_order_items');
    }
};
