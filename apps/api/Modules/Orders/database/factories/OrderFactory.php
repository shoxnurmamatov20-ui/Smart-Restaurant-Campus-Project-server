<?php

declare(strict_types=1);

namespace Modules\Orders\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Orders\Models\Order;

/**
 * @extends Factory<Order>
 */
final class OrderFactory extends Factory
{
    protected $model = Order::class;

    public function definition(): array
    {
        return [
            'number' => 'A-'.$this->faker->unique()->numerify('####'),
            'channel' => 'dine_in',
            'status' => 'placed',
            'table_label' => strtoupper($this->faker->bothify('?-#')),
            'guests_count' => $this->faker->numberBetween(1, 6),
            'subtotal' => 0,
            'discount_total' => 0,
            'service_charge' => 0,
            'total' => 0,
            'placed_at' => now(),
        ];
    }

    public function draft(): static
    {
        return $this->state(['status' => 'draft', 'placed_at' => null]);
    }

    public function paid(): static
    {
        return $this->state(['status' => 'paid', 'closed_at' => now()]);
    }

    public function cancelled(): static
    {
        return $this->state(['status' => 'cancelled', 'closed_at' => now()]);
    }

    public function delivery(): static
    {
        return $this->state(['channel' => 'delivery', 'table_label' => null]);
    }
}
