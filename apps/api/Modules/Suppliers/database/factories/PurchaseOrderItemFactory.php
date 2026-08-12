<?php

declare(strict_types=1);

namespace Modules\Suppliers\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Suppliers\Models\PurchaseOrder;
use Modules\Suppliers\Models\PurchaseOrderItem;

/**
 * @extends Factory<PurchaseOrderItem>
 */
final class PurchaseOrderItemFactory extends Factory
{
    protected $model = PurchaseOrderItem::class;

    public function definition(): array
    {
        return [
            'purchase_order_id' => PurchaseOrder::factory(),
            'name' => $this->faker->randomElement(['Guruch', 'Sabzi', "Qo'y go'shti", 'Un']),
            'quantity' => $this->faker->numberBetween(1000, 20000),
            'unit_price' => $this->faker->numberBetween(1, 20),
            'total_price' => 0,
        ];
    }

    public function configure(): static
    {
        return $this->afterCreating(function (PurchaseOrderItem $item): void {
            if ((int) $item->total_price === 0) {
                $item->forceFill(['total_price' => $item->quantity * $item->unit_price])->save();
            }
        });
    }
}
