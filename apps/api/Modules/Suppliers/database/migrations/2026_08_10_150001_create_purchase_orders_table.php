<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('suppliers.purchase_orders', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('supplier_id')->constrained('suppliers.suppliers')->cascadeOnDelete();
            $table->string('number', 24);
            $table->string('status', 16)->default('draft')->comment('draft');
            $table->datetime('expected_at')->nullable();
            $table->datetime('received_at')->nullable();
            $table->unsignedBigInteger('total')->default(0)->comment('Amount in tiyin (1 UZS = 100 tiyin)');
            $table->text('note')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['tenant_id', 'number']);
            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'supplier_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('suppliers.purchase_orders');
    }
};
