<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Crm\Models\PromoCode;

/**
 * @extends Factory<PromoCode>
 */
final class PromoCodeFactory extends Factory
{
    protected $model = PromoCode::class;

    public function definition(): array
    {
        return [
            'code' => mb_strtoupper($this->faker->unique()->bothify('PROMO##??')),
            'title' => ['uz' => 'Aksiya', 'ru' => 'Акция', 'en' => 'Campaign'],
            'kind' => 'percent',
            'value' => 10,
            'min_tiyin' => 0,
            'max_discount_tiyin' => null,
            'starts_at' => null,
            'ends_at' => null,
            'max_uses' => null,
            'per_customer_limit' => 1,
            'is_active' => true,
        ];
    }

    /** Tiyin off, rather than a percentage of. */
    public function fixed(int $tiyin): static
    {
        return $this->state(['kind' => 'fixed', 'value' => $tiyin]);
    }

    public function percent(int $percent): static
    {
        return $this->state(['kind' => 'percent', 'value' => $percent]);
    }

    /** Ended yesterday — the `promo.expired` path. */
    public function expired(): static
    {
        return $this->state([
            'starts_at' => now()->subMonth(),
            'ends_at' => now()->subDay(),
        ]);
    }

    public function withFloor(int $tiyin): static
    {
        return $this->state(['min_tiyin' => $tiyin]);
    }
}
