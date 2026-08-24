<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Crm\Models\CustomerDish;

/**
 * @extends Factory<CustomerDish>
 */
final class CustomerDishFactory extends Factory
{
    protected $model = CustomerDish::class;

    public function definition(): array
    {
        return [
            'menu_item_id' => $this->faker->unique()->numberBetween(1, 9999),
            'title' => "Osh, to'y oshi",
            'times' => 1,
            'last_at' => now(),
        ];
    }
}
