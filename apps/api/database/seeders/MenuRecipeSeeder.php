<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Inventory\Models\Ingredient;
use Modules\Inventory\Models\PrepItem;
use Modules\Menu\Models\MenuItem;
use Modules\Menu\Models\RecipeLine;

/**
 * Technical cards for the five dishes the operations screen has always drawn.
 *
 * The same five, with the same quantities, that `stock-ops-data.ts` held as a
 * fixture — plov, shashlik, manti, lag'mon, mastava — moved out of a browser
 * and into rows. Until now every food-cost figure on the platform rested on
 * `menu_items.cost_price`, a number somebody typed; these are the lines behind
 * it, so the console's arithmetic and the server's answer the same question.
 *
 * ---------------------------------------------------------------------------
 * Why this seeder lives in the core rather than in Modules/Menu
 *
 * It needs both sides of a join the platform deliberately does not have: a dish
 * from `menu.menu_items`, and an ingredient or a prep card from `inventory.*`.
 * `ModuleBoundaryTest` records no edge between those two modules and the
 * migration explains why the columns carry no foreign key either — at runtime
 * the gap is closed by `App\Contracts\Inventory\ShelfCosts`, which resolves ids
 * to names and costs.
 *
 * A contract cannot help a seeder: this needs to go the other way, from a SKU
 * written in this file to whatever id that SKU happens to have in this
 * database, and inventing a lookup verb on a runtime contract for the sole
 * benefit of demo data would be the worse trade. `database/seeders` is where
 * the platform already keeps the fixtures that span modules, and the boundary
 * rules exempt it for exactly this reason: it is data, not behaviour, and it
 * ships with the platform rather than with either module.
 *
 * ---------------------------------------------------------------------------
 * Declared by INVENTORY's demo config, not Menu's — and that is the ordering
 *
 * `demo:seed` walks the module registry in sidebar order, so Menu (1) runs
 * before Inventory (5). Declared under Menu, this would run before
 * `PrepItemSeeder` had made a single prep card, write only the raw-goods lines,
 * and grow the row count on the second night — which `SeedDemoTenantTest`
 * catches by running the whole set twice. Under Inventory it runs after the
 * shelf and the prep cards both exist.
 *
 * Idempotent by `updateOrCreate` on (dish, component), like every seeder here.
 */
final class MenuRecipeSeeder extends Seeder
{
    /**
     * Dish SKU → its components, in the order they go in the pan.
     *
     * `raw` keys are `inventory.ingredients.sku`, `prep` keys are
     * `inventory.prep_items.code`. Quantities are base units in ONE portion:
     * grams for solids, millilitres for oil.
     *
     * @var array<string, array{raw?: array<string, int>, prep?: array<string, int>}>
     */
    private const CARDS = [
        // Osh — rice, zirvak, onion, oil. The zirvak line is what makes this
        // card worth having: its cost comes from another card, after loss.
        'NAT-001' => ['raw' => ['ING-0004' => 200, 'ING-0006' => 40, 'ING-0008' => 20], 'prep' => ['zirvak' => 260]],
        'GRL-001' => ['raw' => ['ING-0001' => 220, 'ING-0006' => 40, 'ING-0008' => 10]],
        'NAT-002' => ['raw' => ['ING-0006' => 80], 'prep' => ['dough' => 120, 'mince' => 150]],
        'NAT-003' => ['raw' => ['ING-0002' => 120, 'ING-0009' => 100, 'ING-0006' => 60, 'ING-0008' => 25], 'prep' => ['dough' => 150]],
        'SUP-001' => ['raw' => ['ING-0004' => 60, 'ING-0005' => 40, 'ING-0006' => 30], 'prep' => ['broth' => 300]],
    ];

    /**
     * The cards, widened.
     *
     * A literal constant reads to static analysis as a union of exact shapes,
     * which then objects to `?? []` on `raw` and `prep` — both optional by
     * design, since a card can be all raw goods or all prep. The documented
     * shape, stated once.
     *
     * @return array<string, array{raw?: array<string, int>, prep?: array<string, int>}>
     */
    private static function cards(): array
    {
        return self::CARDS;
    }

    public function run(): void
    {
        $ingredients = Ingredient::query()->pluck('id', 'sku');
        $prep = PrepItem::query()->pluck('id', 'code');
        $dishes = MenuItem::query()->whereIn('sku', array_keys(self::CARDS))->get()->keyBy('sku');

        $written = 0;

        foreach (self::cards() as $sku => $card) {
            $dish = $dishes->get($sku);

            if ($dish === null) {
                continue;
            }

            $sort = 10;

            foreach ($card['raw'] ?? [] as $ingredientSku => $quantity) {
                $id = $ingredients[$ingredientSku] ?? null;

                if ($id === null) {
                    continue;
                }

                RecipeLine::query()->updateOrCreate(
                    ['menu_item_id' => $dish->id, 'ingredient_id' => (int) $id],
                    ['prep_item_id' => null, 'quantity' => $quantity, 'sort' => $sort],
                );

                $sort += 10;
                $written++;
            }

            foreach ($card['prep'] ?? [] as $code => $quantity) {
                $id = $prep[$code] ?? null;

                if ($id === null) {
                    continue;
                }

                RecipeLine::query()->updateOrCreate(
                    ['menu_item_id' => $dish->id, 'prep_item_id' => (int) $id],
                    ['ingredient_id' => null, 'quantity' => $quantity, 'sort' => $sort],
                );

                $sort += 10;
                $written++;
            }
        }

        $this->command?->info(sprintf('✅ Menu: %d retsept qatori yozildi.', $written));
    }
}
