<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Crm\Models\Customer;

/**
 * @extends Factory<Customer>
 */
final class CustomerFactory extends Factory
{
    protected $model = Customer::class;

    public function definition(): array
    {
        return [
            'phone' => '+998'.$this->faker->unique()->numerify('9########'),
            'name' => $this->faker->name(),
            'points' => $this->faker->numberBetween(0, 5000),
            'tier' => 'bronze',
            'cashback' => 0,
            'visits_count' => $this->faker->numberBetween(1, 40),
            'total_spent' => $this->faker->numberBetween(5000000, 300000000),
            // No tab unless a test asks for one — the same default the column has,
            // so a factory guest can never accidentally be a credit customer.
            'credit_limit' => 0,
            'account_balance' => 0,
            'is_active' => true,
        ];
    }

    public function gold(): static
    {
        return $this->state(['tier' => 'gold', 'total_spent' => 600000000]);
    }

    public function withPoints(int $points): static
    {
        return $this->state(['points' => $points]);
    }

    /** A guest the restaurant lets sign for lunch. Tiyin, like every other amount. */
    public function withTab(int $creditLimit, int $balance = 0): static
    {
        return $this->state([
            'credit_limit' => $creditLimit,
            'account_balance' => $balance,
        ]);
    }
}
