<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('menu.menu_categories', function (Blueprint $table): void {
            $table->id();

            // Every business row is tenant-scoped — see App\Models\Concerns\BelongsToTenant.
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            // Self-referencing tree: "Issiq taomlar" → "Milliy taomlar".
            $table->foreignId('parent_id')->nullable()->constrained('menu.menu_categories')->nullOnDelete();

            $table->string('slug', 96)->comment('URL-safe key, unique per tenant');
            $table->json('name')->comment('{"uz": "...", "ru": "...", "en": "..."}');
            $table->json('description')->nullable();

            $table->string('icon', 64)->nullable()->comment('Lucide icon key for the UI');
            $table->string('image_url', 500)->nullable();

            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);

            $table->timestamps();
            $table->softDeletes();

            $table->unique(['tenant_id', 'slug']);
            $table->index(['tenant_id', 'is_active', 'sort_order']);
            $table->index(['tenant_id', 'parent_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('menu.menu_categories');
    }
};
