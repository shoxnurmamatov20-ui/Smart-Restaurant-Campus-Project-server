<?php

declare(strict_types=1);

namespace Modules\Menu\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;
use Modules\Menu\Models\MenuCategory;

/**
 * @extends Factory<MenuCategory>
 */
final class MenuCategoryFactory extends Factory
{
    protected $model = MenuCategory::class;

    /**
     * Real sections of an Uzbek restaurant menu, so demo data looks like a
     * restaurant rather than lorem ipsum.
     *
     * @var array<int, array{slug: string, uz: string, ru: string, en: string, icon: string}>
     */
    private const SECTIONS = [
        ['slug' => 'milliy-taomlar', 'uz' => 'Milliy taomlar', 'ru' => 'Национальные блюда', 'en' => 'National dishes', 'icon' => 'utensils'],
        ['slug' => 'issiq-taomlar', 'uz' => 'Issiq taomlar', 'ru' => 'Горячие блюда', 'en' => 'Hot dishes', 'icon' => 'flame'],
        ['slug' => 'shashliklar', 'uz' => 'Shashliklar', 'ru' => 'Шашлыки', 'en' => 'Grill', 'icon' => 'beef'],
        ['slug' => 'salatlar', 'uz' => 'Salatlar', 'ru' => 'Салаты', 'en' => 'Salads', 'icon' => 'salad'],
        ['slug' => 'sho-rvalar', 'uz' => "Sho'rvalar", 'ru' => 'Супы', 'en' => 'Soups', 'icon' => 'soup'],
        ['slug' => 'ichimliklar', 'uz' => 'Ichimliklar', 'ru' => 'Напитки', 'en' => 'Drinks', 'icon' => 'cup-soda'],
        ['slug' => 'desertlar', 'uz' => 'Desertlar', 'ru' => 'Десерты', 'en' => 'Desserts', 'icon' => 'cake-slice'],
        ['slug' => 'nonushta', 'uz' => 'Nonushta', 'ru' => 'Завтраки', 'en' => 'Breakfast', 'icon' => 'egg-fried'],
    ];

    public function definition(): array
    {
        $section = $this->faker->randomElement(self::SECTIONS);

        return [
            'slug' => $section['slug'].'-'.Str::lower(Str::random(4)),
            'name' => [
                'uz' => $section['uz'],
                'ru' => $section['ru'],
                'en' => $section['en'],
            ],
            'description' => null,
            'icon' => $section['icon'],
            'sort_order' => $this->faker->numberBetween(0, 50),
            'is_active' => true,
        ];
    }

    /**
     * A named section with a stable slug — use in seeders where the slug matters.
     */
    public function named(string $slug, string $uz, string $ru, string $en, string $icon = 'utensils'): static
    {
        return $this->state([
            'slug' => $slug,
            'name' => ['uz' => $uz, 'ru' => $ru, 'en' => $en],
            'icon' => $icon,
        ]);
    }

    public function inactive(): static
    {
        return $this->state(['is_active' => false]);
    }

    public function childOf(MenuCategory $parent): static
    {
        return $this->state(['parent_id' => $parent->id]);
    }
}
