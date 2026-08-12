<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders.orders', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->string('number', 24)->comment('Human-facing bill number, unique per tenant');
            $table->string('channel', 16)->default('dine_in')->comment('dine_in');
            $table->string('status', 16)->default('draft');
            $table->unsignedBigInteger('restaurant_table_id')->nullable()->comment('Tables module id, no FK on purpose');
            $table->string('table_label', 32)->nullable()->comment('Snapshot at order time');
            $table->unsignedBigInteger('waiter_user_id')->nullable();
            $table->unsignedBigInteger('customer_id')->nullable()->comment('CRM module id, no FK on purpose');
            $table->unsignedTinyInteger('guests_count')->default(1);
            $table->unsignedBigInteger('subtotal')->default(0)->comment('Amount in tiyin (1 UZS = 100 tiyin)');
            $table->unsignedBigInteger('discount_total')->default(0)->comment('Amount in tiyin (1 UZS = 100 tiyin)');
            $table->unsignedBigInteger('service_charge')->default(0)->comment('Amount in tiyin (1 UZS = 100 tiyin)');
            $table->unsignedBigInteger('total')->default(0)->comment('Amount in tiyin (1 UZS = 100 tiyin)');
            $table->datetime('placed_at')->nullable();
            $table->datetime('closed_at')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['tenant_id', 'number']);
            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'channel', 'placed_at']);
            $table->index(['tenant_id', 'restaurant_table_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orders.orders');
    }
};
