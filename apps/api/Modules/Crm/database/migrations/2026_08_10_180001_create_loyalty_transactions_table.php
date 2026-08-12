<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm.loyalty_transactions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained('crm.customers')->cascadeOnDelete();
            $table->string('kind', 16)->comment('earn');
            $table->integer('points')->comment('Signed');
            $table->integer('balance_after')->default(0);
            $table->unsignedBigInteger('order_id')->nullable();
            $table->string('note', 255)->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'customer_id']);
            $table->index(['tenant_id', 'kind']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm.loyalty_transactions');
    }
};
