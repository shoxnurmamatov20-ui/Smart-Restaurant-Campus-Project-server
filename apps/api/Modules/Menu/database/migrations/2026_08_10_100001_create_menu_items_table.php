<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('menu.menu_items', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('menu_category_id')->constrained('menu.menu_categories')->cascadeOnDelete();

            $table->string('sku', 48)->comment('Kitchen/POS code, unique per tenant, e.g. OSH-001');
            $table->json('name')->comment('{"uz": "...", "ru": "...", "en": "..."}');
            $table->json('description')->nullable();

            $table->string('kind', 16)->default('food')->comment('food|drink|combo|other');

            // Money is stored as an integer in tiyin (1 UZS = 100 tiyin) so that
            // no rounding error can ever reach a guest's bill.
            $table->unsignedBigInteger('price')->comment('Menu price in tiyin');
            $table->unsignedBigInteger('cost_price')->nullable()
                ->comment('Theoretical food cost in tiyin, recalculated from the recipe');
            $table->char('currency', 3)->default('UZS');

            // Kitchen routing
            $table->unsignedSmallInteger('cook_time_minutes')->default(15);
            $table->string('station', 32)->default('hot')
                ->comment('Kitchen station: hot|cold|grill|bar|pastry');

            // Nutrition / dietary
            $table->unsignedInteger('weight_grams')->nullable();
            $table->unsignedInteger('calories')->nullable();
            $table->json('allergens')->nullable()->comment('["gluten","nuts","dairy",...]');
            $table->boolean('is_halal')->default(true);
            $table->boolean('is_vegetarian')->default(false);
            $table->unsignedTinyInteger('spice_level')->default(0)->comment('0..3');

            // Availability — the stop-list lives here so POS and QR menu agree.
            $table->boolean('is_available')->default(true);
            $table->timestamp('stopped_until')->nullable()
                ->comment('When set, the item auto-returns to the menu at this time');
            $table->string('status', 16)->default('active')->comment('draft|active|archived');

            $table->string('image_url', 500)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);

            $table->json('channels')->nullable()
                ->comment('Where it is sold: ["dine_in","takeaway","delivery","aggregator"]');
            $table->json('metadata')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->unique(['tenant_id', 'sku']);
            $table->index(['tenant_id', 'status', 'is_available']);
            $table->index(['tenant_id', 'menu_category_id', 'sort_order']);
            $table->index(['tenant_id', 'station']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('menu.menu_items');
    }
};
