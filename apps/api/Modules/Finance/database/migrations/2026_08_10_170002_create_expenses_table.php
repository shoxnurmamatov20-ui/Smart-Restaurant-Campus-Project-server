<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('finance.expenses', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('cash_shift_id')->nullable()->constrained('finance.cash_shifts')->nullOnDelete();
            $table->string('category', 32)->comment('rent');
            $table->string('description', 255);
            $table->unsignedBigInteger('amount')->comment('Amount in tiyin (1 UZS = 100 tiyin)');
            $table->boolean('paid_in_cash')->default(true)->comment('Only cash payouts affect the Z-report');
            $table->datetime('spent_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'category', 'spent_at']);
            $table->index(['tenant_id', 'cash_shift_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('finance.expenses');
    }
};
