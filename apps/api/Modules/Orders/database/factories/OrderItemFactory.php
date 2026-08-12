<?php

declare(strict_types=1);

namespace Modules\Orders\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Orders\Models\Order;
use Modules\Orders\Models\OrderItem;

/**
 * @extends Factory<OrderItem>
 */
final class OrderItemFactory extends Factory
{
    protected $model = OrderItem::class;

    public function definition(): array
    {
        return [
            'order_id' => Order::factory(),
            'sku' => strtoupper($this->faker->bothify('???-###')),
            'title' => $this->faker->randomElement(['Osh', 'Manti', "Lag'mon", 'Somsa', 'Shashlik']),
            'station' => $this->faker->randomElement(['hot', 'grill', 'cold', 'bar']),
            'quantity' => $this->faker->numberBetween(1, 3),
            'unit_price' => $this->faker->numberBetween(1000000, 5000000),
            'total_price' => 0,
            'status' => 'pending',
        ];
    }

    public function configure(): static
    {
        // Keep the line total consistent with quantity x unit price by default.
        return $this->afterMaking(function (OrderItem $item): void {
            if ((int) $item->total_price === 0) {
                $item->total_price = $item->unit_price * $item->quantity;
            }
        })->afterCreating(function (OrderItem $item): void {
            if ((int) $item->total_price === 0) {
                $item->forceFill(['total_price' => $item->unit_price * $item->quantity])->save();
            }
        });
    }

    public function ready(): static
    {
        return $this->state(['status' => 'ready']);
    }
}
