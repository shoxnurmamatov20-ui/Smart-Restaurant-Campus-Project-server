<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('finance.payments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('cash_shift_id')->nullable()->constrained('finance.cash_shifts')->nullOnDelete();
            $table->unsignedBigInteger('order_id')->nullable()->comment('Orders module id, no FK on purpose');
            $table->string('order_number', 24)->nullable();
            $table->string('method', 16)->default('cash')->comment('cash');
            $table->unsignedBigInteger('amount')->comment('Amount in tiyin (1 UZS = 100 tiyin)');
            $table->string('status', 16)->default('captured')->comment('captured');
            $table->string('fiscal_receipt_no', 64)->nullable()->comment('From the fiscal module');
            $table->datetime('paid_at')->nullable();
            $table->datetime('refunded_at')->nullable();
            $table->string('refund_reason', 255)->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'cash_shift_id']);
            $table->index(['tenant_id', 'method', 'status']);
            $table->index(['tenant_id', 'paid_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('finance.payments');
    }
};
