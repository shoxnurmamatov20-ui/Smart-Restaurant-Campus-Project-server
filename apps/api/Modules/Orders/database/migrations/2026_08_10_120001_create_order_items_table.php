<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders.order_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('order_id')->constrained('orders.orders')->cascadeOnDelete();
            $table->unsignedBigInteger('menu_item_id')->nullable()->comment('Menu module id, no FK on purpose');
            $table->string('sku', 48);
            $table->string('title', 160)->comment('Dish name as printed on the bill');
            $table->string('station', 32)->default('hot');
            $table->unsignedSmallInteger('quantity')->default(1);
            $table->unsignedBigInteger('unit_price')->comment('Amount in tiyin (1 UZS = 100 tiyin)');
            $table->unsignedBigInteger('total_price')->comment('Amount in tiyin (1 UZS = 100 tiyin)');
            $table->string('status', 16)->default('pending')->comment('pending');
            $table->string('note', 500)->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'order_id']);
            $table->index(['tenant_id', 'station', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orders.order_items');
    }
};
