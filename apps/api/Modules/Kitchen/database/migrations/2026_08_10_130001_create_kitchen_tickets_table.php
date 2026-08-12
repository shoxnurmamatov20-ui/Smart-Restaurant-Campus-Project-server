<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kitchen.kitchen_tickets', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->unsignedBigInteger('order_id')->comment('Orders module id, no FK on purpose');
            $table->string('order_number', 24);
            $table->string('station', 32);
            $table->string('table_label', 32)->nullable();
            $table->string('channel', 16)->default('dine_in');
            $table->string('status', 16)->default('new')->comment('new');
            $table->json('lines')->nullable()->comment('[{sku,title,quantity,note}]');
            $table->unsignedSmallInteger('sla_minutes')->default(20);
            $table->datetime('started_at')->nullable();
            $table->datetime('ready_at')->nullable();
            $table->datetime('served_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'station', 'status']);
            $table->index(['tenant_id', 'order_id']);
            $table->index(['tenant_id', 'status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kitchen.kitchen_tickets');
    }
};
