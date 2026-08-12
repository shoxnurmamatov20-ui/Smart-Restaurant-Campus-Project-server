<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('suppliers.suppliers', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->string('code', 32);
            $table->string('name', 160);
            $table->string('contact_name', 120)->nullable();
            $table->string('phone', 32)->nullable();
            $table->string('email', 160)->nullable();
            $table->unsignedSmallInteger('payment_terms_days')->default(0)->comment('0 = pay on delivery');
            $table->unsignedTinyInteger('rating')->default(5)->comment('1..5, based on lateness and quality');
            $table->unsignedBigInteger('debt')->default(0)->comment('What we still owe, in tiyin');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['tenant_id', 'code']);
            $table->index(['tenant_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('suppliers.suppliers');
    }
};
