<?php

declare(strict_types=1);

namespace Modules\Finance\Database\Factories;

use App\Contracts\Finance\PaymentResult;
use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Finance\Models\PaymentInvoice;

/**
 * @extends Factory<PaymentInvoice>
 */
final class PaymentInvoiceFactory extends Factory
{
    protected $model = PaymentInvoice::class;

    public function definition(): array
    {
        return [
            'token' => PaymentInvoice::mintToken(),
            'provider' => 'sandbox',
            'order_number' => 'A-'.$this->faker->numerify('####'),
            // A realistic Tashkent bill, in tiyin: 20 000 to 300 000 so'm.
            'amount' => $this->faker->numberBetween(20_000, 300_000) * 100,
            'state' => PaymentResult::PENDING,
            'pay_url' => 'https://example.test/pay/'.$this->faker->uuid(),
        ];
    }

    public function paid(): static
    {
        return $this->state([
            'state' => PaymentResult::PAID,
            'paid_at' => now(),
            'provider_invoice_id' => $this->faker->numerify('##########'),
        ]);
    }

    public function forProvider(string $provider): static
    {
        return $this->state(['provider' => $provider]);
    }
}
