<?php

declare(strict_types=1);

namespace Modules\Finance\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Finance\Models\CashCount;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Support\CashDenominations;

/**
 * @extends Factory<CashCount>
 */
final class CashCountFactory extends Factory
{
    protected $model = CashCount::class;

    /**
     * A plausible float: four big notes and enough small ones to give change.
     */
    public function definition(): array
    {
        $breakdown = [
            10_000_000 => 4,   // 4 × 100 000
            5_000_000 => 4,    // 4 × 50 000
            1_000_000 => 10,   // 10 × 10 000
            100_000 => 20,     // 20 × 1 000
        ];

        return [
            'cash_shift_id' => CashShift::factory(),
            'kind' => 'open',
            'breakdown' => $breakdown,
            'total' => CashDenominations::total($breakdown),
            'counted_at' => now(),
        ];
    }

    /**
     * @param array<int, int> $breakdown
     */
    public function of(array $breakdown): static
    {
        return $this->state([
            'breakdown' => $breakdown,
            'total' => CashDenominations::total($breakdown),
        ]);
    }

    public function closing(): static
    {
        return $this->state(['kind' => 'close']);
    }
}
