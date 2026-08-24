<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Crm\Models\Coupon;

/**
 * @extends Factory<Coupon>
 */
final class CouponFactory extends Factory
{
    protected $model = Coupon::class;

    public function definition(): array
    {
        return [
            'key' => $this->faker->unique()->slug(2),
            'name' => ['uz' => 'Kupon', 'ru' => 'Купон', 'en' => 'Coupon'],
            'note' => ['uz' => 'Har qanday buyurtmada', 'ru' => 'На любой заказ', 'en' => 'On any order'],
            'points_cost' => 500,
            'kind' => 'percent',
            'value' => 5,
            'min_tiyin' => 0,
            'tone' => 'accent',
            'starts_at' => null,
            'ends_at' => null,
            'sort_order' => 0,
            'is_active' => true,
        ];
    }

    public function costing(int $points): static
    {
        return $this->state(['points_cost' => $points]);
    }

    /** On the shelf and free — the "manager said sorry" case. */
    public function free(): static
    {
        return $this->state(['points_cost' => 0]);
    }
}
