<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm.feedbacks', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('crm.customers')->nullOnDelete();
            $table->unsignedBigInteger('order_id')->nullable();
            $table->unsignedTinyInteger('score')->comment('1..5');
            $table->text('comment')->nullable();
            $table->string('aspect', 32)->nullable()->comment('food');
            $table->string('source', 16)->default('bot')->comment('bot');
            $table->boolean('is_urgent')->default(false)->comment('Food safety, injury or abuse — a manager must see it now');
            $table->string('status', 16)->default('new')->comment('new');
            $table->datetime('resolved_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'status', 'is_urgent']);
            $table->index(['tenant_id', 'score']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm.feedbacks');
    }
};
