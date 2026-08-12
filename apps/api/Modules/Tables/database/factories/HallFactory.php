<?php

declare(strict_types=1);

namespace Modules\Tables\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Tables\Models\Hall;

/**
 * @extends Factory<Hall>
 */
final class HallFactory extends Factory
{
    protected $model = Hall::class;

    public function definition(): array
    {
        return [
            'code' => strtoupper($this->faker->unique()->lexify('H???')),
            'name' => $this->faker->randomElement(['Asosiy zal', 'Terassa', 'VIP zal', 'Bar zonasi']),
            'capacity' => $this->faker->numberBetween(20, 120),
            'sort_order' => $this->faker->numberBetween(0, 50),
            'is_active' => true,
        ];
    }

    public function inactive(): static
    {
        return $this->state(['is_active' => false]);
    }
}
