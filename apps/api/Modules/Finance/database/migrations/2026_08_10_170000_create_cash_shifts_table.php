<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('finance.cash_shifts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->string('number', 24);
            $table->unsignedBigInteger('opened_by_user_id')->nullable();
            $table->datetime('opened_at');
            $table->datetime('closed_at')->nullable();
            $table->unsignedBigInteger('opening_cash')->default(0)->comment('Amount in tiyin (1 UZS = 100 tiyin)');
            $table->unsignedBigInteger('expected_cash')->default(0)->comment('Opening float + cash payments − payouts');
            $table->unsignedBigInteger('counted_cash')->default(0)->comment('What the cashier actually counted');
            $table->unsignedBigInteger('difference')->default(0)->comment('counted − expected; negative means short');
            $table->string('status', 16)->default('open')->comment('open');
            $table->text('note')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['tenant_id', 'number']);
            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'opened_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('finance.cash_shifts');
    }
};
