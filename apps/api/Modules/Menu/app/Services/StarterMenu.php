<?php

declare(strict_types=1);

namespace Modules\Menu\Services;

use Illuminate\Support\Facades\DB;
use Modules\Menu\Database\Seeders\MenuDatabaseSeeder;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;

/**
 * The menu a restaurant starts with, written on its behalf.
 *
 * A restaurant that has just signed up opens the Menu screen to an empty table
 * and a button that says "starter template". Until now that button downloaded
 * nothing and posted nothing — the template it named is the catalogue the demo
 * seeder holds, and there was no door onto it.
 *
 * **It writes, it does not download.** A spreadsheet the owner then has to
 * import is two steps where one will do, and the import path already exists for
 * a restaurant that has its own list. What somebody with no list needs is a
 * menu on the screen they can edit.
 *
 * **Idempotent by skipping, not by overwriting.** A second press must not
 * restore a price somebody has just corrected or bring back a dish they
 * deleted; a category or a dish that is already there is left exactly as it is
 * and counted as skipped. That is what makes the button safe to press when
 * nobody remembers whether it was pressed before — which is the state every
 * setup wizard is actually used in.
 *
 * The catalogue itself lives on `MenuDatabaseSeeder`, deliberately: the demo
 * and the starter template are the same sixty-eight dishes, and keeping two
 * copies is keeping two copies that disagree the first time a price is fixed.
 */
final class StarterMenu
{
    /**
     * The catalogue, widened.
     *
     * The seeder's constants are literal arrays, so static analysis reads them
     * as one enormous union of exact shapes and then objects to every `?? null`
     * on a key that is optional by design — not every dish declares a weight or
     * an allergen. Stating the documented shape once here is cheaper than eight
     * suppressions, and it is the same shape the seeder's own docblock gives.
     *
     * @return array<int, array{slug: string, uz: string, ru: string, en: string, icon: string}>
     */
    private static function sections(): array
    {
        return MenuDatabaseSeeder::CATEGORIES;
    }

    /** @return array<string, array<int, array<string, mixed>>> */
    private static function catalogue(): array
    {
        return MenuDatabaseSeeder::ITEMS;
    }

    /**
     * @return array{categories_created: int, items_created: int, skipped: int}
     */
    public function writeInto(): array
    {
        return DB::transaction(function (): array {
            $categories = [];
            $categoriesCreated = 0;
            $skipped = 0;
            $sortOrder = 10;

            foreach (self::sections() as $section) {
                $existing = MenuCategory::query()->where('slug', $section['slug'])->first();

                if ($existing !== null) {
                    $categories[$section['slug']] = $existing;
                    $skipped++;
                    $sortOrder += 10;

                    continue;
                }

                $categories[$section['slug']] = MenuCategory::query()->create([
                    'slug' => $section['slug'],
                    'name' => ['uz' => $section['uz'], 'ru' => $section['ru'], 'en' => $section['en']],
                    'icon' => $section['icon'],
                    'sort_order' => $sortOrder,
                    'is_active' => true,
                ]);

                $categoriesCreated++;
                $sortOrder += 10;
            }

            $itemsCreated = 0;

            foreach (self::catalogue() as $categorySlug => $dishes) {
                $category = $categories[$categorySlug] ?? null;

                if ($category === null) {
                    continue;
                }

                $itemOrder = 10;

                foreach ($dishes as $dish) {
                    if (MenuItem::query()->where('sku', $dish['sku'])->exists()) {
                        $skipped++;
                        $itemOrder += 10;

                        continue;
                    }

                    MenuItem::query()->create([
                        'menu_category_id' => $category->id,
                        'sku' => $dish['sku'],
                        'name' => ['uz' => $dish['uz'], 'ru' => $dish['ru'], 'en' => $dish['en']],
                        'kind' => $dish['kind'] ?? 'food',
                        'price' => $dish['price'],
                        /*
                         * The template's own food cost, and it is a starting
                         * point rather than a fact: nobody has costed a recipe
                         * card in a restaurant that opened this morning. The
                         * margin column reads it, `menu.recipe_lines` replaces
                         * it the moment a real card exists.
                         */
                        'cost_price' => $dish['cost'],
                        'currency' => 'UZS',
                        'cook_time_minutes' => $dish['cook'],
                        'station' => $dish['station'],
                        'weight_grams' => $dish['weight'] ?? null,
                        'calories' => $dish['kcal'] ?? null,
                        'allergens' => $dish['allergens'] ?? null,
                        'is_halal' => true,
                        'is_vegetarian' => $dish['veg'] ?? false,
                        'spice_level' => $dish['spice'] ?? 0,
                        'is_available' => true,
                        'status' => 'active',
                        'sort_order' => $itemOrder,
                        'channels' => ['dine_in', 'takeaway', 'delivery'],
                    ]);

                    $itemsCreated++;
                    $itemOrder += 10;
                }
            }

            return [
                'categories_created' => $categoriesCreated,
                'items_created' => $itemsCreated,
                'skipped' => $skipped,
            ];
        });
    }
}
