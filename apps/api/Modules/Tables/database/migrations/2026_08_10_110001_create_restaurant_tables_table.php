<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tables.restaurant_tables', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('hall_id')->constrained('tables.halls')->cascadeOnDelete();
            $table->string('label', 32)->comment('What the guests and waiters call it, e.g. A-7');
            $table->unsignedTinyInteger('seats')->default(4);
            $table->string('kind', 16)->default('regular')->comment('regular');
            $table->string('status', 16)->default('free')->comment('free');
            $table->string('qr_token', 64)->nullable()->comment('Opens the public QR menu for this table');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['tenant_id', 'label']);
            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'hall_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tables.restaurant_tables');
    }
};
