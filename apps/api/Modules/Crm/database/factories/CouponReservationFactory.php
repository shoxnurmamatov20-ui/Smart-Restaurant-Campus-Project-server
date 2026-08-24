<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Crm\Models\Coupon;
use Modules\Crm\Models\CouponReservation;
use Modules\Crm\Models\Customer;

/**
 * @extends Factory<CouponReservation>
 */
final class CouponReservationFactory extends Factory
{
    protected $model = CouponReservation::class;

    public function definition(): array
    {
        return [
            'coupon_id' => Coupon::factory(),
            'customer_id' => Customer::factory(),
            'code' => CouponReservation::mintCode(),
            'points_spent' => 500,
            'expires_at' => now()->addDays(30),
            'redeemed_at' => null,
        ];
    }
}
