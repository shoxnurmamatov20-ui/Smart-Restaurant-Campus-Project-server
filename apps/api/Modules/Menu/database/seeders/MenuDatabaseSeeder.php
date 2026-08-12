<?php

declare(strict_types=1);

namespace Modules\Menu\Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;

/**
 * A complete, believable Uzbek restaurant menu.
 *
 * This is demo data a salesperson can open in front of a restaurateur without
 * apologising for it — real dish names, real price levels, real food cost.
 *
 * Run via:
 *   php artisan module:seed Menu
 *   php artisan db:seed --class="Modules\Menu\Database\Seeders\MenuDatabaseSeeder"
 */
final class MenuDatabaseSeeder extends Seeder
{
    /**
     * Sections of the menu.
     *
     * @var array<int, array{slug: string, uz: string, ru: string, en: string, icon: string}>
     */
    private const CATEGORIES = [
        ['slug' => 'nonushta', 'uz' => 'Nonushta', 'ru' => 'Завтраки', 'en' => 'Breakfast', 'icon' => 'egg-fried'],
        ['slug' => 'salatlar', 'uz' => 'Salatlar', 'ru' => 'Салаты', 'en' => 'Salads', 'icon' => 'salad'],
        ['slug' => 'shorvalar', 'uz' => "Sho'rvalar", 'ru' => 'Супы', 'en' => 'Soups', 'icon' => 'soup'],
        ['slug' => 'milliy-taomlar', 'uz' => 'Milliy taomlar', 'ru' => 'Национальные блюда', 'en' => 'National dishes', 'icon' => 'utensils'],
        ['slug' => 'shashliklar', 'uz' => 'Shashliklar', 'ru' => 'Шашлыки', 'en' => 'Grill', 'icon' => 'beef'],
        ['slug' => 'garnirlar', 'uz' => 'Garnirlar', 'ru' => 'Гарниры', 'en' => 'Sides', 'icon' => 'wheat'],
        ['slug' => 'ichimliklar', 'uz' => 'Ichimliklar', 'ru' => 'Напитки', 'en' => 'Drinks', 'icon' => 'cup-soda'],
        ['slug' => 'desertlar', 'uz' => 'Desertlar', 'ru' => 'Десерты', 'en' => 'Desserts', 'icon' => 'cake-slice'],
    ];

    /**
     * Dishes, grouped by category slug.
     *
     * Prices are in tiyin — 4_500_000 tiyin = 45 000 so'm.
     *
     * @var array<string, array<int, array{sku: string, uz: string, ru: string, en: string, price: int, cost: int, station: string, cook: int, kind?: string, veg?: bool, spice?: int, weight?: int, kcal?: int, allergens?: array<int, string>}>>
     */
    private const ITEMS = [
        'nonushta' => [
            ['sku' => 'BRK-001', 'uz' => 'Qaymoq bilan non', 'ru' => 'Хлеб со сливками', 'en' => 'Bread with cream', 'price' => 1800000, 'cost' => 520000, 'station' => 'cold', 'cook' => 5, 'veg' => true, 'weight' => 180, 'kcal' => 320, 'allergens' => ['gluten', 'dairy']],
            ['sku' => 'BRK-002', 'uz' => 'Omlet', 'ru' => 'Омлет', 'en' => 'Omelette', 'price' => 2200000, 'cost' => 700000, 'station' => 'hot', 'cook' => 8, 'veg' => true, 'weight' => 200, 'kcal' => 380, 'allergens' => ['eggs', 'dairy']],
            ['sku' => 'BRK-003', 'uz' => "Sutli bo'tqa", 'ru' => 'Молочная каша', 'en' => 'Milk porridge', 'price' => 1600000, 'cost' => 430000, 'station' => 'hot', 'cook' => 10, 'veg' => true, 'weight' => 250, 'kcal' => 290, 'allergens' => ['dairy', 'gluten']],
        ],
        'salatlar' => [
            ['sku' => 'SAL-001', 'uz' => 'Achchiq-chuchuk', 'ru' => 'Ачик-чучук', 'en' => 'Tomato & onion salad', 'price' => 1800000, 'cost' => 480000, 'station' => 'cold', 'cook' => 5, 'veg' => true, 'spice' => 1, 'weight' => 200, 'kcal' => 90],
            ['sku' => 'SAL-002', 'uz' => 'Sezar salati', 'ru' => 'Цезарь', 'en' => 'Caesar salad', 'price' => 3600000, 'cost' => 1200000, 'station' => 'cold', 'cook' => 10, 'weight' => 240, 'kcal' => 420, 'allergens' => ['eggs', 'dairy', 'gluten']],
            ['sku' => 'SAL-003', 'uz' => 'Olivye', 'ru' => 'Оливье', 'en' => 'Olivier salad', 'price' => 2600000, 'cost' => 830000, 'station' => 'cold', 'cook' => 8, 'weight' => 220, 'kcal' => 350, 'allergens' => ['eggs']],
            ['sku' => 'SAL-004', 'uz' => 'Yunon salati', 'ru' => 'Греческий салат', 'en' => 'Greek salad', 'price' => 3200000, 'cost' => 1050000, 'station' => 'cold', 'cook' => 8, 'veg' => true, 'weight' => 230, 'kcal' => 260, 'allergens' => ['dairy']],
        ],
        'shorvalar' => [
            ['sku' => 'SUP-001', 'uz' => 'Mastava', 'ru' => 'Мастава', 'en' => 'Mastava', 'price' => 2500000, 'cost' => 720000, 'station' => 'hot', 'cook' => 12, 'weight' => 350, 'kcal' => 310],
            ['sku' => 'SUP-002', 'uz' => "Sho'rva", 'ru' => 'Шурпа', 'en' => 'Shurpa', 'price' => 3000000, 'cost' => 980000, 'station' => 'hot', 'cook' => 14, 'weight' => 400, 'kcal' => 420],
            ['sku' => 'SUP-003', 'uz' => 'Chuchvara', 'ru' => 'Чучвара', 'en' => 'Chuchvara', 'price' => 3800000, 'cost' => 1150000, 'station' => 'hot', 'cook' => 15, 'weight' => 320, 'kcal' => 460, 'allergens' => ['gluten', 'eggs']],
            ['sku' => 'SUP-004', 'uz' => 'Tovuq bulyoni', 'ru' => 'Куриный бульон', 'en' => 'Chicken broth', 'price' => 2000000, 'cost' => 560000, 'station' => 'hot', 'cook' => 10, 'weight' => 300, 'kcal' => 180],
        ],
        'milliy-taomlar' => [
            ['sku' => 'NAT-001', 'uz' => "Osh (to'y palov)", 'ru' => 'Плов', 'en' => 'Pilaf', 'price' => 4500000, 'cost' => 1420000, 'station' => 'hot', 'cook' => 12, 'weight' => 350, 'kcal' => 680],
            ['sku' => 'NAT-002', 'uz' => 'Manti', 'ru' => 'Манты', 'en' => 'Manti', 'price' => 4000000, 'cost' => 1250000, 'station' => 'hot', 'cook' => 25, 'weight' => 320, 'kcal' => 590, 'allergens' => ['gluten']],
            ['sku' => 'NAT-003', 'uz' => "Lag'mon", 'ru' => 'Лагман', 'en' => 'Lagman', 'price' => 4200000, 'cost' => 1330000, 'station' => 'hot', 'cook' => 18, 'spice' => 1, 'weight' => 400, 'kcal' => 620, 'allergens' => ['gluten', 'eggs']],
            ['sku' => 'NAT-004', 'uz' => 'Norin', 'ru' => 'Норин', 'en' => 'Norin', 'price' => 4300000, 'cost' => 1380000, 'station' => 'cold', 'cook' => 10, 'weight' => 300, 'kcal' => 540, 'allergens' => ['gluten']],
            ['sku' => 'NAT-005', 'uz' => 'Somsa (go\'shtli)', 'ru' => 'Самса с мясом', 'en' => 'Meat samsa', 'price' => 1200000, 'cost' => 380000, 'station' => 'pastry', 'cook' => 8, 'weight' => 150, 'kcal' => 400, 'allergens' => ['gluten']],
            ['sku' => 'NAT-006', 'uz' => 'Qozon kabob', 'ru' => 'Казан-кебаб', 'en' => 'Kazan kebab', 'price' => 5200000, 'cost' => 1750000, 'station' => 'hot', 'cook' => 22, 'weight' => 380, 'kcal' => 720],
        ],
        'shashliklar' => [
            ['sku' => 'GRL-001', 'uz' => "Qo'y shashlik", 'ru' => 'Шашлык из баранины', 'en' => 'Lamb kebab', 'price' => 3500000, 'cost' => 1300000, 'station' => 'grill', 'cook' => 20, 'weight' => 180, 'kcal' => 480],
            ['sku' => 'GRL-002', 'uz' => 'Tovuq shashlik', 'ru' => 'Куриный шашлык', 'en' => 'Chicken kebab', 'price' => 2800000, 'cost' => 900000, 'station' => 'grill', 'cook' => 16, 'weight' => 180, 'kcal' => 380],
            ['sku' => 'GRL-003', 'uz' => 'Mol shashlik', 'ru' => 'Говяжий шашлык', 'en' => 'Beef kebab', 'price' => 3800000, 'cost' => 1420000, 'station' => 'grill', 'cook' => 20, 'weight' => 180, 'kcal' => 460],
            ['sku' => 'GRL-004', 'uz' => 'Lyulya kabob', 'ru' => 'Люля-кебаб', 'en' => 'Lyulya kebab', 'price' => 3200000, 'cost' => 1100000, 'station' => 'grill', 'cook' => 18, 'spice' => 1, 'weight' => 200, 'kcal' => 520],
            ['sku' => 'GRL-005', 'uz' => 'Sabzavot shashlik', 'ru' => 'Овощной шашлык', 'en' => 'Vegetable skewer', 'price' => 2200000, 'cost' => 640000, 'station' => 'grill', 'cook' => 14, 'veg' => true, 'weight' => 200, 'kcal' => 190],
        ],
        'garnirlar' => [
            ['sku' => 'SID-001', 'uz' => 'Fri kartoshka', 'ru' => 'Картофель фри', 'en' => 'French fries', 'price' => 1800000, 'cost' => 520000, 'station' => 'hot', 'cook' => 8, 'veg' => true, 'weight' => 150, 'kcal' => 380],
            ['sku' => 'SID-002', 'uz' => 'Tandir non', 'ru' => 'Тандырная лепёшка', 'en' => 'Tandoor bread', 'price' => 600000, 'cost' => 160000, 'station' => 'pastry', 'cook' => 3, 'veg' => true, 'weight' => 120, 'kcal' => 260, 'allergens' => ['gluten']],
            ['sku' => 'SID-003', 'uz' => 'Guruch garnir', 'ru' => 'Рисовый гарнир', 'en' => 'Rice side', 'price' => 1400000, 'cost' => 380000, 'station' => 'hot', 'cook' => 6, 'veg' => true, 'weight' => 180, 'kcal' => 240],
        ],
        'ichimliklar' => [
            ['sku' => 'DRK-001', 'uz' => "Ko'k choy", 'ru' => 'Зелёный чай', 'en' => 'Green tea', 'price' => 800000, 'cost' => 150000, 'station' => 'bar', 'cook' => 4, 'kind' => 'drink', 'veg' => true, 'weight' => 500, 'kcal' => 0],
            ['sku' => 'DRK-002', 'uz' => 'Qora choy', 'ru' => 'Чёрный чай', 'en' => 'Black tea', 'price' => 800000, 'cost' => 150000, 'station' => 'bar', 'cook' => 4, 'kind' => 'drink', 'veg' => true, 'weight' => 500, 'kcal' => 0],
            ['sku' => 'DRK-003', 'uz' => 'Ayron', 'ru' => 'Айран', 'en' => 'Ayran', 'price' => 1000000, 'cost' => 280000, 'station' => 'bar', 'cook' => 2, 'kind' => 'drink', 'veg' => true, 'weight' => 300, 'kcal' => 120, 'allergens' => ['dairy']],
            ['sku' => 'DRK-004', 'uz' => 'Apelsin fresh', 'ru' => 'Апельсиновый фреш', 'en' => 'Fresh orange juice', 'price' => 2200000, 'cost' => 780000, 'station' => 'bar', 'cook' => 5, 'kind' => 'drink', 'veg' => true, 'weight' => 300, 'kcal' => 150],
            ['sku' => 'DRK-005', 'uz' => 'Mineral suv', 'ru' => 'Минеральная вода', 'en' => 'Mineral water', 'price' => 700000, 'cost' => 250000, 'station' => 'bar', 'cook' => 1, 'kind' => 'drink', 'veg' => true, 'weight' => 500, 'kcal' => 0],
            ['sku' => 'DRK-006', 'uz' => 'Amerikano', 'ru' => 'Американо', 'en' => 'Americano', 'price' => 1800000, 'cost' => 420000, 'station' => 'bar', 'cook' => 4, 'kind' => 'drink', 'veg' => true, 'weight' => 200, 'kcal' => 5],
        ],
        'desertlar' => [
            ['sku' => 'DES-001', 'uz' => 'Chak-chak', 'ru' => 'Чак-чак', 'en' => 'Chak-chak', 'price' => 1500000, 'cost' => 400000, 'station' => 'pastry', 'cook' => 3, 'veg' => true, 'weight' => 120, 'kcal' => 380, 'allergens' => ['gluten', 'eggs', 'nuts']],
            ['sku' => 'DES-002', 'uz' => 'Napoleon torti', 'ru' => 'Наполеон', 'en' => 'Napoleon cake', 'price' => 2400000, 'cost' => 720000, 'station' => 'pastry', 'cook' => 5, 'veg' => true, 'weight' => 150, 'kcal' => 450, 'allergens' => ['gluten', 'dairy', 'eggs']],
            ['sku' => 'DES-003', 'uz' => 'Muzqaymoq', 'ru' => 'Мороженое', 'en' => 'Ice cream', 'price' => 1600000, 'cost' => 480000, 'station' => 'cold', 'cook' => 2, 'veg' => true, 'weight' => 100, 'kcal' => 260, 'allergens' => ['dairy']],
        ],
    ];

    public function run(): void
    {
        $categories = [];
        $sortOrder = 10;

        foreach (self::CATEGORIES as $section) {
            $categories[$section['slug']] = MenuCategory::query()->updateOrCreate(
                ['slug' => $section['slug']],
                [
                    'name' => ['uz' => $section['uz'], 'ru' => $section['ru'], 'en' => $section['en']],
                    'icon' => $section['icon'],
                    'sort_order' => $sortOrder,
                    'is_active' => true,
                ],
            );

            $sortOrder += 10;
        }

        $itemCount = 0;

        foreach (self::ITEMS as $categorySlug => $dishes) {
            $category = $categories[$categorySlug];
            $itemOrder = 10;

            foreach ($dishes as $dish) {
                MenuItem::query()->updateOrCreate(
                    ['sku' => $dish['sku']],
                    [
                        'menu_category_id' => $category->id,
                        'name' => ['uz' => $dish['uz'], 'ru' => $dish['ru'], 'en' => $dish['en']],
                        'kind' => $dish['kind'] ?? 'food',
                        'price' => $dish['price'],
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
                    ],
                );

                $itemOrder += 10;
                $itemCount++;
            }
        }

        $this->command?->info(sprintf(
            '✅ Menu: %d kategoriya, %d taom yaratildi.',
            count($categories),
            $itemCount,
        ));
    }
}
