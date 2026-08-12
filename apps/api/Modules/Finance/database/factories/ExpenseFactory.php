<?php

declare(strict_types=1);

namespace Modules\Finance\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Finance\Models\Expense;

/**
 * @extends Factory<Expense>
 */
final class ExpenseFactory extends Factory
{
    protected $model = Expense::class;

    public function definition(): array
    {
        return [
            'category' => $this->faker->randomElement(['purchase', 'utilities', 'repair']),
            'description' => $this->faker->sentence(3),
            'amount' => $this->faker->numberBetween(1000000, 50000000),
            'paid_in_cash' => true,
            'spent_at' => now(),
        ];
    }
}
