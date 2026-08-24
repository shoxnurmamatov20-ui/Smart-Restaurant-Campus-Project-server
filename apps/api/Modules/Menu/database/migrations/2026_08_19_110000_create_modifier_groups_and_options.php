<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What goes with a dish, and what it costs.
 *
 * The word "modifier" did not appear anywhere in this repository, and the POS
 * carried five of them as a hard-coded list in a fixture file. That list is not
 * a menu: a restaurant adds a sauce, renames a portion and changes what extra
 * meat costs without anybody deploying, and every one of those is a price on a
 * receipt.
 *
 * Two tables and a pivot, because the shape the design draws is a GROUP with
 * rules ("Doneness — pick exactly one", "Add-ons — up to five") holding OPTIONS
 * with their own price deltas. Flattening it into one table would lose the
 * rules, and the rules are what stops a kitchen ticket arriving saying both
 * "Rare" and "Well done".
 *
 * Attached per dish through the pivot rather than per category: doneness
 * belongs to steak and not to tea, and a category is the wrong grain for that.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('menu.modifier_groups', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            // Guest-facing, so jsonb {uz,ru,en} like every other name here.
            $table->jsonb('name');

            /*
             * The rules, as three numbers rather than a mode.
             *
             * `is_multi` and (min, max) look redundant and are not: "pick
             * exactly one" is (1,1), "up to five" is (0,5), and "at least two
             * sauces" is (2,5) — a boolean cannot express the third, and the
             * design's own groups already use two of the three shapes. The
             * boolean stays because a client renders a radio list differently
             * from a checkbox list, and that is a display question.
             */
            $table->boolean('is_multi')->default(false);
            $table->unsignedSmallInteger('min_choices')->default(0);
            $table->unsignedSmallInteger('max_choices')->default(1);

            $table->unsignedSmallInteger('sort')->default(0);
            $table->boolean('is_active')->default(true);

            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'is_active', 'sort']);
        });

        Schema::create('menu.modifier_options', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('modifier_group_id')->constrained('menu.modifier_groups')->cascadeOnDelete();

            $table->jsonb('name');

            /*
             * What it adds, in tiyin, and it may be zero or negative.
             *
             * Zero is the common case — "no onion" costs nothing — and negative
             * is real too: a smaller portion at a lower price is a modifier,
             * not a second dish. A column that could not go below zero would
             * force that into the menu as a duplicate item.
             */
            $table->bigInteger('price_delta')->default(0);

            $table->unsignedSmallInteger('sort')->default(0);
            $table->boolean('is_active')->default(true);

            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'modifier_group_id', 'is_active', 'sort']);
        });

        Schema::create('menu.menu_item_modifier_group', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('menu_item_id')->constrained('menu.menu_items')->cascadeOnDelete();
            $table->foreignId('modifier_group_id')->constrained('menu.modifier_groups')->cascadeOnDelete();

            // Per dish, because the same group can sit in a different place on
            // two dishes: size first on a coffee, doneness first on a steak.
            $table->unsignedSmallInteger('sort')->default(0);

            $table->timestamps();

            $table->unique(['menu_item_id', 'modifier_group_id']);
        });

        RowLevelSecurity::guard(
            'menu.modifier_groups',
            'menu.modifier_options',
            'menu.menu_item_modifier_group',
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('menu.menu_item_modifier_group');
        Schema::dropIfExists('menu.modifier_options');
        Schema::dropIfExists('menu.modifier_groups');
    }
};
