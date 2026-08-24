<?php

declare(strict_types=1);

namespace Modules\Finance\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Models\FiscalReceipt;

/**
 * @extends Factory<FiscalReceipt>
 */
final class FiscalReceiptFactory extends Factory
{
    protected $model = FiscalReceipt::class;

    public function definition(): array
    {
        return [
            'cash_shift_id' => CashShift::factory(),
            'order_id' => $this->faker->unique()->numberBetween(1, 100_000),
            'order_number' => 'A-'.$this->faker->numerify('####'),
            'kind' => 'sale',
            'status' => 'pending',
            'total' => 30_000_000,
            'cash_total' => 30_000_000,
            'card_total' => 0,
            'vat_total' => 3_600_000,
            'expires_at' => now()->addDay(),
        ];
    }

    public function registered(): static
    {
        return $this->state([
            'status' => 'registered',
            'fiscal_sign' => $this->faker->numerify('##########'),
            'receipt_seq' => $this->faker->numerify('######'),
            'module_no' => $this->faker->numerify('########'),
            'registered_at' => now(),
            'provider' => 'logging',
        ]);
    }

    public function expired(): static
    {
        return $this->state([
            'status' => 'expired',
            'expires_at' => now()->subHour(),
            'attempts' => 6,
            'last_error' => 'OFD javob bermadi',
        ]);
    }
}
