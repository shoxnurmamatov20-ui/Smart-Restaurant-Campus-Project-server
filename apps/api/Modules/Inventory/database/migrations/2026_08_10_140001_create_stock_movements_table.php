<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory.stock_movements', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('ingredient_id')->constrained('inventory.ingredients')->cascadeOnDelete();
            $table->string('kind', 16)->comment('receipt');
            $table->integer('quantity')->comment('Signed: positive in, negative out');
            $table->integer('balance_after')->default(0);
            $table->string('reason', 255)->nullable();
            $table->string('reference', 64)->nullable()->comment('Purchase order or order number');
            $table->datetime('happened_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'ingredient_id', 'happened_at']);
            $table->index(['tenant_id', 'kind']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory.stock_movements');
    }
};
