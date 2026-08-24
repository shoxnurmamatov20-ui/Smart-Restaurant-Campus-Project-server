<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The technical card: what a dish is made of.
 *
 * `menu_items.cost_price` has always been described as *"theoretical food cost
 * in tiyin, recalculated from the recipe"* — recalculated from a recipe that
 * did not exist. Every food-cost figure on the platform, every margin column,
 * every ABC placement rests on a number somebody typed into a form; the console
 * drew four costed dishes from a fixture and said so in a paragraph.
 *
 * This is the join that was missing, and three things about it are decisions:
 *
 *  - **It lives in `menu`, not `inventory`.** The card belongs to the dish: it
 *    is read whenever a dish is read, it is deleted when the dish is, and a
 *    restaurant that has no warehouse module still has recipes on paper. The
 *    other way round, `inventory` would own a table keyed on a catalogue it may
 *    not import.
 *
 *  - **`ingredient_id` and `prep_item_id` carry no foreign key.** Deliberate,
 *    and the same choice `suppliers.purchase_order_items.ingredient_id` already
 *    made: a constraint across module schemas is an import the compiler cannot
 *    see and the boundary tests cannot police, and it would make Menu
 *    un-migratable without Inventory. What replaces it is
 *    `App\Contracts\Inventory\ShelfCosts`, which simply omits an id that no
 *    longer resolves — so a card with a deleted ingredient reads as a card with
 *    a hole in it rather than as a card costed at nothing.
 *
 *  - **Exactly one of the two per line.** A line is either raw goods off the
 *    shelf or something the kitchen made this morning, never both and never
 *    neither. Enforced in the database rather than in a request, because the
 *    seeder and the importer write here too and a rule that lives in one of
 *    three doors is a rule.
 *
 * Quantities are integers in the component's own base unit — grams,
 * millilitres, pieces — like every other quantity in this system. Two hundred
 * grams of rice is `200`, and a float would accumulate error across a month of
 * production runs exactly as a float som would across a day of bills.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('menu.recipe_lines', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('menu_item_id')->constrained('menu.menu_items')->cascadeOnDelete();

            // Bare ids into Inventory. See the docblock: no FK on purpose.
            $table->unsignedBigInteger('ingredient_id')->nullable()
                ->comment('inventory.ingredients id — no FK, resolved through App\Contracts\Inventory\ShelfCosts');
            $table->unsignedBigInteger('prep_item_id')->nullable()
                ->comment('inventory.prep_items id — no FK, same reason');

            $table->unsignedInteger('quantity')
                ->comment('Base units of the component in ONE portion of the dish');

            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();

            /*
             * A component appears once per card.
             *
             * Two partial keys rather than one composite: PostgreSQL treats
             * NULLs as distinct, so a card with four prep lines would sail past
             * a unique index that included the null `ingredient_id`. Listing
             * beef twice is two lines a cook has to add up and a card nobody
             * can audit.
             */
            $table->unique(['menu_item_id', 'ingredient_id']);
            $table->unique(['menu_item_id', 'prep_item_id']);

            $table->index(['tenant_id', 'menu_item_id', 'sort']);
        });

        /*
         * Raw goods or prep, never both, never neither.
         *
         * A raw statement because a Blueprint cannot express a CHECK, and in
         * the database rather than in a FormRequest because three doors write
         * here — the request, the importer and the demo seeder — and a rule
         * that lives in one of three doors is not a rule.
         */
        DB::statement(
            'alter table menu.recipe_lines add constraint recipe_lines_one_component check ('
            .'(ingredient_id is not null and prep_item_id is null)'
            .' or (ingredient_id is null and prep_item_id is not null))',
        );

        RowLevelSecurity::guard('menu.recipe_lines');
    }

    public function down(): void
    {
        Schema::dropIfExists('menu.recipe_lines');
    }
};
