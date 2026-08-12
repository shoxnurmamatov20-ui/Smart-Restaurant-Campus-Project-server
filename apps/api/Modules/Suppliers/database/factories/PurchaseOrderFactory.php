<?php

declare(strict_types=1);

namespace Modules\Suppliers\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Suppliers\Models\PurchaseOrder;
use Modules\Suppliers\Models\Supplier;

/**
 * @extends Factory<PurchaseOrder>
 */
final class PurchaseOrderFactory extends Factory
{
    protected $model = PurchaseOrder::class;

    public function definition(): array
    {
        return [
            'supplier_id' => Supplier::factory(),
            'number' => 'PO-'.$this->faker->unique()->numerify('####'),
            'status' => 'draft',
            'expected_at' => now()->addDay(),
            'total' => 0,
        ];
    }

    public function received(): static
    {
        return $this->state(['status' => 'received', 'received_at' => now()]);
    }
}
