<?php

declare(strict_types=1);

namespace Modules\Menu\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Menu\Models\ModifierGroup;
use Modules\Menu\Models\ModifierOption;

/**
 * @extends Factory<ModifierOption>
 */
final class ModifierOptionFactory extends Factory
{
    protected $model = ModifierOption::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'modifier_group_id' => ModifierGroup::factory(),
            'name' => ['uz' => 'Qo\'shimcha pishloq', 'ru' => 'Доп. сыр', 'en' => 'Extra cheese'],
            // Tiyin. 6 000 so'm.
            'price_delta' => 600_000,
            'sort' => 0,
            'is_active' => true,
        ];
    }

    /** Costs nothing — "no onion", "sauce on the side". */
    public function free(): static
    {
        return $this->state(fn (): array => [
            'name' => ['uz' => 'Piyozsiz', 'ru' => 'Без лука', 'en' => 'No onion'],
            'price_delta' => 0,
        ]);
    }
}
