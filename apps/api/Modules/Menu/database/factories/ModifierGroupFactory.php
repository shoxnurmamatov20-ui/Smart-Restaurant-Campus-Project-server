<?php

declare(strict_types=1);

namespace Modules\Menu\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Menu\Models\ModifierGroup;

/**
 * @extends Factory<ModifierGroup>
 */
final class ModifierGroupFactory extends Factory
{
    protected $model = ModifierGroup::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => ['uz' => 'Qo\'shimchalar', 'ru' => 'Добавки', 'en' => 'Add-ons'],
            'is_multi' => true,
            'min_choices' => 0,
            'max_choices' => 5,
            'sort' => 0,
            'is_active' => true,
        ];
    }

    /** Pick exactly one — doneness, size, a cooking style. */
    public function single(): static
    {
        return $this->state(fn (): array => [
            'name' => ['uz' => 'Pishirish darajasi', 'ru' => 'Степень прожарки', 'en' => 'Doneness'],
            'is_multi' => false,
            'min_choices' => 1,
            'max_choices' => 1,
        ]);
    }
}
