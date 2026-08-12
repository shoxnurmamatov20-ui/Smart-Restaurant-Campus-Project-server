<?php

declare(strict_types=1);

namespace Modules\Menu\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;

/**
 * @extends Factory<MenuItem>
 */
final class MenuItemFactory extends Factory
{
    protected $model = MenuItem::class;

    /**
     * A realistic Uzbek restaurant assortment. Prices are in tiyin
     * (1 UZS = 100 tiyin), so 45_000_00 reads as 45 000 so'm.
     *
     * @var array<int, array{sku: string, uz: string, ru: string, en: string, price: int, station: string, cook: int, kind: string}>
     */
    private const DISHES = [
        ['sku' => 'OSH', 'uz' => 'Osh (palov)', 'ru' => 'Плов', 'en' => 'Pilaf', 'price' => 4500000, 'station' => 'hot', 'cook' => 12, 'kind' => 'food'],
        ['sku' => 'MNT', 'uz' => 'Manti', 'ru' => 'Манты', 'en' => 'Manti', 'price' => 4000000, 'station' => 'hot', 'cook' => 25, 'kind' => 'food'],
        ['sku' => 'LGM', 'uz' => "Lag'mon", 'ru' => 'Лагман', 'en' => 'Lagman', 'price' => 4200000, 'station' => 'hot', 'cook' => 18, 'kind' => 'food'],
        ['sku' => 'SMS', 'uz' => 'Somsa', 'ru' => 'Самса', 'en' => 'Samsa', 'price' => 1200000, 'station' => 'pastry', 'cook' => 8, 'kind' => 'food'],
        ['sku' => 'CHV', 'uz' => 'Chuchvara', 'ru' => 'Чучвара', 'en' => 'Chuchvara', 'price' => 3800000, 'station' => 'hot', 'cook' => 15, 'kind' => 'food'],
        ['sku' => 'SHK', 'uz' => "Qo'y shashlik", 'ru' => 'Шашлык из баранины', 'en' => 'Lamb kebab', 'price' => 3500000, 'station' => 'grill', 'cook' => 20, 'kind' => 'food'],
        ['sku' => 'TVK', 'uz' => 'Tovuq shashlik', 'ru' => 'Куриный шашлык', 'en' => 'Chicken kebab', 'price' => 2800000, 'station' => 'grill', 'cook' => 16, 'kind' => 'food'],
        ['sku' => 'ACH', 'uz' => 'Achchiq-chuchuk', 'ru' => 'Ачик-чучук', 'en' => 'Tomato salad', 'price' => 1800000, 'station' => 'cold', 'cook' => 5, 'kind' => 'food'],
        ['sku' => 'MSC', 'uz' => 'Sezar salati', 'ru' => 'Цезарь', 'en' => 'Caesar salad', 'price' => 3600000, 'station' => 'cold', 'cook' => 10, 'kind' => 'food'],
        ['sku' => 'MST', 'uz' => 'Mastava', 'ru' => 'Мастава', 'en' => 'Mastava soup', 'price' => 2500000, 'station' => 'hot', 'cook' => 12, 'kind' => 'food'],
        ['sku' => 'SHR', 'uz' => "Sho'rva", 'ru' => 'Шурпа', 'en' => 'Shurpa', 'price' => 3000000, 'station' => 'hot', 'cook' => 14, 'kind' => 'food'],
        ['sku' => 'CHY', 'uz' => "Ko'k choy", 'ru' => 'Зелёный чай', 'en' => 'Green tea', 'price' => 800000, 'station' => 'bar', 'cook' => 4, 'kind' => 'drink'],
        ['sku' => 'AYR', 'uz' => 'Ayron', 'ru' => 'Айран', 'en' => 'Ayran', 'price' => 1000000, 'station' => 'bar', 'cook' => 2, 'kind' => 'drink'],
        ['sku' => 'FRS', 'uz' => 'Apelsin fresh', 'ru' => 'Апельсиновый фреш', 'en' => 'Orange juice', 'price' => 2200000, 'station' => 'bar', 'cook' => 5, 'kind' => 'drink'],
        ['sku' => 'CHK', 'uz' => 'Chak-chak', 'ru' => 'Чак-чак', 'en' => 'Chak-chak', 'price' => 1500000, 'station' => 'pastry', 'cook' => 3, 'kind' => 'food'],
        ['sku' => 'NPL', 'uz' => 'Napoleon torti', 'ru' => 'Наполеон', 'en' => 'Napoleon cake', 'price' => 2400000, 'station' => 'pastry', 'cook' => 5, 'kind' => 'food'],
    ];

    public function definition(): array
    {
        $dish = $this->faker->randomElement(self::DISHES);
        $price = $dish['price'];

        return [
            'menu_category_id' => MenuCategory::factory(),
            'sku' => $dish['sku'].'-'.Str::upper(Str::random(4)),
            'name' => [
                'uz' => $dish['uz'],
                'ru' => $dish['ru'],
                'en' => $dish['en'],
            ],
            'description' => null,
            'kind' => $dish['kind'],
            'price' => $price,
            // A healthy restaurant runs 25–40% food cost.
            'cost_price' => (int) round($price * $this->faker->randomFloat(2, 0.25, 0.40)),
            'currency' => 'UZS',
            'cook_time_minutes' => $dish['cook'],
            'station' => $dish['station'],
            'weight_grams' => $this->faker->numberBetween(120, 450),
            'calories' => $this->faker->numberBetween(90, 780),
            'allergens' => null,
            'is_halal' => true,
            'is_vegetarian' => false,
            'spice_level' => $this->faker->numberBetween(0, 2),
            'is_available' => true,
            'status' => 'active',
            'sort_order' => $this->faker->numberBetween(0, 100),
            'channels' => ['dine_in', 'takeaway', 'delivery'],
        ];
    }

    /** A named dish with a stable SKU — for seeders and tests. */
    public function dish(string $sku, string $uz, string $ru, string $en, int $priceTiyin, string $station = 'hot'): static
    {
        return $this->state([
            'sku' => $sku,
            'name' => ['uz' => $uz, 'ru' => $ru, 'en' => $en],
            'price' => $priceTiyin,
            'station' => $station,
        ]);
    }

    public function drink(): static
    {
        return $this->state([
            'kind' => 'drink',
            'station' => 'bar',
            'cook_time_minutes' => 3,
            'is_vegetarian' => true,
        ]);
    }

    public function vegetarian(): static
    {
        return $this->state(['is_vegetarian' => true]);
    }

    /** On the stop-list — ingredient ran out. */
    public function stopped(): static
    {
        return $this->state([
            'is_available' => false,
            'stopped_until' => null,
        ]);
    }

    public function draft(): static
    {
        return $this->state(['status' => 'draft']);
    }

    public function archived(): static
    {
        return $this->state(['status' => 'archived']);
    }

    public function inCategory(MenuCategory $category): static
    {
        return $this->state(['menu_category_id' => $category->id]);
    }
}
