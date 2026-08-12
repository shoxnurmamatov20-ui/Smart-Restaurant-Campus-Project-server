<?php

declare(strict_types=1);

namespace Modules\Finance\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Finance\Models\CashShift;

/**
 * @extends Factory<CashShift>
 */
final class CashShiftFactory extends Factory
{
    protected $model = CashShift::class;

    public function definition(): array
    {
        return [
            'number' => 'Z-'.$this->faker->unique()->numerify('####'),
            'opened_at' => now()->subHours(6),
            'opening_cash' => 50000000,
            'status' => 'open',
        ];
    }

    public function closed(): static
    {
        return $this->state(['status' => 'closed', 'closed_at' => now()]);
    }
}
