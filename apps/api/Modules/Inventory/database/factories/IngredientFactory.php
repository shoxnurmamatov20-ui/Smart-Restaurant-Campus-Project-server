<?php

declare(strict_types=1);

namespace Modules\Inventory\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Inventory\Models\Ingredient;

/**
 * @extends Factory<Ingredient>
 */
final class IngredientFactory extends Factory
{
    protected $model = Ingredient::class;

    public function definition(): array
    {
        return [
            'sku' => strtoupper($this->faker->unique()->bothify('ING-####')),
            'name' => $this->faker->randomElement(['Qo\'y go\'shti', 'Guruch', 'Sabzi', 'Piyoz', 'Un', 'Pomidor', 'Yog\'']),
            'unit' => 'g',
            // Bought by the kilo, held by the gram — the common case, and the
            // one every quantity in this factory is written in.
            'purchase_unit' => 'kg',
            'units_per_purchase' => 1000,
            'stock_quantity' => $this->faker->numberBetween(5000, 60000),
            'min_quantity' => 5000,
            'cost_per_unit' => $this->faker->numberBetween(2, 90),
            'storage' => $this->faker->randomElement(['dry', 'chilled', 'frozen']),
            'store' => 'main',
            'is_active' => true,
        ];
    }

    /** On a named shelf — what the store chips filter by. */
    public function inStore(string $store): static
    {
        return $this->state(['store' => $store]);
    }

    public function low(): static
    {
        return $this->state(['stock_quantity' => 1000, 'min_quantity' => 5000]);
    }

    public function outOfStock(): static
    {
        return $this->state(['stock_quantity' => 0, 'min_quantity' => 1000]);
    }
}
