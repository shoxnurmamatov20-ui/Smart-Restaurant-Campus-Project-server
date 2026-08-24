<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Crm\Models\AccountEntry;
use Modules\Crm\Models\Customer;

/**
 * @extends Factory<AccountEntry>
 */
final class AccountEntryFactory extends Factory
{
    protected $model = AccountEntry::class;

    /**
     * A charge by default, because that is what a tab is mostly made of.
     *
     * `balance_after` is left equal to `amount` rather than guessed: a factory
     * cannot know what came before, and a plausible-looking running total that
     * does not actually follow from the rows is worse than an obvious one. Tests
     * that care about the running balance post through the service, which is the
     * only thing that maintains it.
     */
    public function definition(): array
    {
        $amount = $this->faker->numberBetween(500, 5000) * 100;

        return [
            'customer_id' => Customer::factory(),
            'kind' => 'charge',
            'amount' => $amount,
            'balance_after' => $amount,
            'order_number' => 'A-'.$this->faker->unique()->numerify('#####'),
            'occurred_at' => now(),
        ];
    }

    public function settlement(int $amount): static
    {
        return $this->state([
            'kind' => 'settlement',
            'amount' => -abs($amount),
            'balance_after' => 0,
            'order_id' => null,
            'order_number' => null,
        ]);
    }

    public function writeoff(int $amount): static
    {
        return $this->state([
            'kind' => 'writeoff',
            'amount' => -abs($amount),
            'balance_after' => 0,
            'note' => 'Undiriladigan emas deb hisobdan chiqarildi',
        ]);
    }
}
