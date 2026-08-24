<?php

declare(strict_types=1);

namespace Modules\Finance\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Finance\Models\CashMovement;
use Modules\Finance\Models\CashShift;

/**
 * @extends Factory<CashMovement>
 */
final class CashMovementFactory extends Factory
{
    protected $model = CashMovement::class;

    public function definition(): array
    {
        return [
            'cash_shift_id' => CashShift::factory(),
            'direction' => 'in',
            'amount' => 5_000_000,
            'reason' => 'Maydalash uchun pul',
            'occurred_at' => now(),
        ];
    }
}
