<?php

declare(strict_types=1);

namespace Modules\Suppliers\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Suppliers\Models\Supplier;

/**
 * @extends Factory<Supplier>
 */
final class SupplierFactory extends Factory
{
    protected $model = Supplier::class;

    public function definition(): array
    {
        return [
            'code' => strtoupper($this->faker->unique()->bothify('SUP-###')),
            'name' => $this->faker->company(),
            'contact_name' => $this->faker->name(),
            'phone' => '+998'.$this->faker->numerify('9########'),
            'payment_terms_days' => $this->faker->randomElement([0, 7, 14, 30]),
            'rating' => 5,
            'debt' => 0,
            'is_active' => true,
        ];
    }

    public function inDebt(int $tiyin = 50000000): static
    {
        return $this->state(['debt' => $tiyin]);
    }
}
