<?php

declare(strict_types=1);

namespace Modules\Marketplace\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Marketplace\Models\Consumer;
use Modules\Marketplace\Models\MarketOrder;
use Modules\Marketplace\Models\Store;
use Modules\Marketplace\Services\MarketPricing;
use Modules\Marketplace\Support\MarketOrderState;

/**
 * @extends Factory<MarketOrder>
 */
final class MarketOrderFactory extends Factory
{
    protected $model = MarketOrder::class;

    /**
     * A freshly placed order, with its money already consistent.
     *
     * The figures come from `MarketPricing` rather than being typed in, and
     * that is the point: a factory with hand-written totals is a factory that
     * lets a test pass while the arithmetic it is testing is wrong. Change the
     * commission rule and this factory changes with it, or the tests fail —
     * which is the correct outcome.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $subtotal = 13_400_000;

        $totals = MarketPricing::of(
            subtotal: $subtotal,
            deliveryFee: 1_200_000,
            servicePercent: MarketOrder::DEFAULT_SERVICE_PERCENT,
            commissionPercent: Store::DEFAULT_COMMISSION_PERCENT,
        );

        return [
            'number' => MarketOrder::nextNumber(),
            'consumer_id' => Consumer::factory(),
            'store_id' => Store::factory(),
            'state' => MarketOrderState::Placed->value,
            'pay_rail' => 'click',
            'address' => 'Chilonzor 24, 3-podyezd, 47-xonadon',
            'eta_minutes' => 40,
            'placed_at' => now(),
            ...$totals->toArray(),
        ];
    }

    /** Accepted, with no bill behind it — for tests about the ladder alone. */
    public function accepted(): self
    {
        return $this->state(fn (): array => [
            'state' => MarketOrderState::Accepted->value,
            'accepted_at' => now(),
        ]);
    }

    public function delivered(): self
    {
        return $this->state(fn (): array => [
            'state' => MarketOrderState::Delivered->value,
            'accepted_at' => now()->subMinutes(45),
            'delivered_at' => now(),
        ]);
    }
}
