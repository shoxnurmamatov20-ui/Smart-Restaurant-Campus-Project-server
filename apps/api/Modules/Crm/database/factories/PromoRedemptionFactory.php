<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\PromoCode;
use Modules\Crm\Models\PromoRedemption;

/**
 * @extends Factory<PromoRedemption>
 */
final class PromoRedemptionFactory extends Factory
{
    protected $model = PromoRedemption::class;

    public function definition(): array
    {
        return [
            'promo_code_id' => PromoCode::factory(),
            'customer_id' => Customer::factory(),
            'order_id' => null,
            'discount_tiyin' => 500000,
        ];
    }
}
