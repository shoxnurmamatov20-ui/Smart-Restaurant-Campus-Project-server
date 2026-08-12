<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory.ingredients', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->string('sku', 48);
            $table->string('name', 160);
            $table->string('unit', 8)->default('g')->comment('g');
            $table->integer('stock_quantity')->default(0)->comment('Running balance, moved only by StockMovement');
            $table->integer('min_quantity')->default(0)->comment('Reorder point');
            $table->unsignedBigInteger('cost_per_unit')->default(0)->comment('Tiyin per one base unit');
            $table->string('storage', 32)->nullable()->comment('dry');
            $table->unsignedSmallInteger('shelf_life_days')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['tenant_id', 'sku']);
            $table->index(['tenant_id', 'is_active']);
            $table->index(['tenant_id', 'storage']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory.ingredients');
    }
};
