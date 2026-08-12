<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tables.reservations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('restaurant_table_id')->nullable()->constrained('tables.restaurant_tables')->nullOnDelete();
            $table->string('guest_name', 120);
            $table->string('guest_phone', 32);
            $table->unsignedTinyInteger('guests_count')->default(2);
            $table->datetime('starts_at');
            $table->datetime('ends_at')->nullable();
            $table->string('status', 16)->default('pending')->comment('pending');
            $table->string('source', 16)->default('phone')->comment('phone');
            $table->text('note')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'status', 'starts_at']);
            $table->index(['tenant_id', 'guest_phone']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tables.reservations');
    }
};
