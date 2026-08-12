<?php

declare(strict_types=1);

namespace Modules\Inventory\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Inventory\Models\Ingredient;
use Modules\Inventory\Models\StockMovement;

/**
 * @extends Factory<StockMovement>
 */
final class StockMovementFactory extends Factory
{
    protected $model = StockMovement::class;

    public function definition(): array
    {
        return [
            'ingredient_id' => Ingredient::factory(),
            'kind' => $this->faker->randomElement(['receipt', 'consumption', 'write_off']),
            'quantity' => $this->faker->numberBetween(-5000, 5000),
            'balance_after' => $this->faker->numberBetween(0, 50000),
            'happened_at' => now(),
        ];
    }

    public function writeOff(): static
    {
        return $this->state([
            'kind' => 'write_off',
            'quantity' => -1000,
            'reason' => 'Muddati o\'tgan',
        ]);
    }
}
