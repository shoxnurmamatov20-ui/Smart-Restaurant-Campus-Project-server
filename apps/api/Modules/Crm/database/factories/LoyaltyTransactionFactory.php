<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\LoyaltyTransaction;

/**
 * @extends Factory<LoyaltyTransaction>
 */
final class LoyaltyTransactionFactory extends Factory
{
    protected $model = LoyaltyTransaction::class;

    public function definition(): array
    {
        return [
            'customer_id' => Customer::factory(),
            'kind' => 'earn',
            'points' => 100,
            'balance_after' => 100,
        ];
    }
}
