<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm.customers', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->string('phone', 32);
            $table->string('name', 160)->nullable();
            $table->date('birthday')->nullable();
            $table->integer('points')->default(0);
            $table->string('tier', 16)->default('bronze')->comment('bronze');
            $table->unsignedBigInteger('cashback')->default(0)->comment('Amount in tiyin (1 UZS = 100 tiyin)');
            $table->unsignedInteger('visits_count')->default(0);
            $table->unsignedBigInteger('total_spent')->default(0)->comment('Amount in tiyin (1 UZS = 100 tiyin)');
            $table->json('allergens')->nullable();
            $table->text('note')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['tenant_id', 'phone']);
            $table->index(['tenant_id', 'tier']);
            $table->index(['tenant_id', 'birthday']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm.customers');
    }
};
