<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Crm\Models\PromotionUse;

/**
 * @extends Factory<PromotionUse>
 */
final class PromotionUseFactory extends Factory
{
    protected $model = PromotionUse::class;

    public function definition(): array
    {
        return [
            'order_id' => null,
            'discount_tiyin' => 500000,
            'total_tiyin' => 4800000,
        ];
    }
}
