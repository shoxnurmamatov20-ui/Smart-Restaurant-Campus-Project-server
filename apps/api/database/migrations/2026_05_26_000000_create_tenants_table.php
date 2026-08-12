<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('public.tenants', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('slug', 64)->unique();
            $table->char('country_code', 2)->default('UZ');
            $table->string('locale', 8)->default('uz');
            $table->string('timezone', 64)->default('Asia/Tashkent');
            $table->enum('status', ['active', 'suspended', 'archived'])->default('active');
            $table->json('settings')->nullable();
            $table->timestamps();

            $table->index(['status', 'country_code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('public.tenants');
    }
};
