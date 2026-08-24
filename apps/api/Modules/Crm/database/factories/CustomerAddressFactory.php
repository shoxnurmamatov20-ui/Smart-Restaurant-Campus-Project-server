<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\CustomerAddress;

/**
 * @extends Factory<CustomerAddress>
 */
final class CustomerAddressFactory extends Factory
{
    protected $model = CustomerAddress::class;

    public function definition(): array
    {
        return [
            'customer_id' => Customer::factory(),
            'label' => $this->faker->randomElement(['Uy', 'Ish', 'Onamning uyi']),
            'line' => 'Chilonzor '.$this->faker->numberBetween(1, 26).', '.$this->faker->numberBetween(1, 90).'-uy',
            'entrance' => (string) $this->faker->numberBetween(1, 6),
            'floor' => (string) $this->faker->numberBetween(1, 9),
            'flat' => (string) $this->faker->numberBetween(1, 120),
            // False by default, so a test that wants a default says so — a
            // factory that made every address the default would collide with
            // the partial unique index on the second call.
            'is_default' => false,
        ];
    }

    public function primary(): static
    {
        return $this->state(['is_default' => true]);
    }
}
