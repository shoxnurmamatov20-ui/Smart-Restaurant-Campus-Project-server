<?php

declare(strict_types=1);

namespace Modules\Finance\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Models\Payment;

/**
 * @extends Factory<Payment>
 */
final class PaymentFactory extends Factory
{
    protected $model = Payment::class;

    public function definition(): array
    {
        return [
            'cash_shift_id' => CashShift::factory(),
            'order_number' => 'A-'.$this->faker->numerify('####'),
            'method' => $this->faker->randomElement(['cash', 'card', 'payme']),
            'amount' => $this->faker->numberBetween(2000000, 30000000),
            'status' => 'captured',
            'paid_at' => now(),
        ];
    }

    public function cash(): static
    {
        return $this->state(['method' => 'cash']);
    }

    public function refunded(): static
    {
        return $this->state(['status' => 'refunded', 'refunded_at' => now(), 'refund_reason' => 'Test']);
    }
}
