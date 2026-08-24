<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Crm\Models\Promotion;

/**
 * @extends Factory<Promotion>
 */
final class PromotionFactory extends Factory
{
    protected $model = Promotion::class;

    public function definition(): array
    {
        return [
            'name' => ['uz' => 'Biznes-lanch', 'ru' => 'Бизнес-ланч', 'en' => 'Business lunch'],
            'rule_text' => null,
            'kind' => 'basket_off',
            'value' => 10,
            'min_tiyin' => 0,
            'quantity' => 0,
            'dishes' => null,
            'days' => null,
            'starts_minute' => null,
            'ends_minute' => null,
            'channels' => null,
            'starts_on' => null,
            'ends_on' => null,
            'is_active' => true,
        ];
    }

    public function paused(): static
    {
        return $this->state(['is_active' => false]);
    }

    /** Weekday lunchtimes only — the business-lunch shape. */
    public function weekdayLunch(): static
    {
        return $this->state([
            'days' => [1, 2, 3, 4, 5],
            'starts_minute' => 12 * 60,
            'ends_minute' => 15 * 60,
            'channels' => ['dine_in'],
        ]);
    }

    /** A window that crosses midnight — the happy-hour shape. */
    public function lateNight(): static
    {
        return $this->state(['starts_minute' => 23 * 60, 'ends_minute' => 60]);
    }
}
