<?php

declare(strict_types=1);

namespace Modules\Kitchen\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Kitchen\Models\KitchenStation;

/**
 * @extends Factory<KitchenStation>
 */
final class KitchenStationFactory extends Factory
{
    protected $model = KitchenStation::class;

    public function definition(): array
    {
        return [
            'code' => $this->faker->unique()->randomElement(['hot', 'cold', 'grill', 'bar', 'pastry']),
            'name' => $this->faker->randomElement(['Issiq sex', 'Sovuq sex', 'Mangal', 'Bar', 'Konditer']),
            'sla_minutes' => 20,
            'sort_order' => $this->faker->numberBetween(0, 50),
            'is_active' => true,
        ];
    }
}
