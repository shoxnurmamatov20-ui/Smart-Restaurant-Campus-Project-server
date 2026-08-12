<?php

declare(strict_types=1);

namespace Modules\Pos\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;
use Modules\Pos\Models\Terminal;

/**
 * @extends Factory<Terminal>
 */
final class TerminalFactory extends Factory
{
    protected $model = Terminal::class;

    public function definition(): array
    {
        return [
            'code' => 'KASSA-'.Str::upper(Str::random(4)),
            'name' => 'Kassa '.$this->faker->numberBetween(1, 9),
            'mode' => 'table_service',
            'status' => 'active',
            'settings' => [
                'currency' => 'UZS',
                // Rounding to the nearest 100 tiyin (1 so'm): coins below that
                // do not exist in circulation.
                'cash_rounding_tiyin' => 100,
                'discount_limits' => [
                    'waiter' => 0,
                    'cashier' => 5,
                    'branch-manager' => 30,
                ],
            ],
        ];
    }

    public function quickService(): static
    {
        return $this->state(fn (): array => ['mode' => 'quick_service', 'name' => 'Fast food kassa']);
    }

    public function bar(): static
    {
        return $this->state(fn (): array => ['mode' => 'bar', 'name' => 'Bar kassa']);
    }

    public function counter(): static
    {
        return $this->state(fn (): array => ['mode' => 'counter', 'name' => 'Kafe kassa']);
    }

    public function disabled(): static
    {
        return $this->state(fn (): array => ['status' => 'disabled']);
    }

    /** Already through pairing, with a device on the other end. */
    public function paired(): static
    {
        return $this->state(fn (): array => [
            'paired_at' => now()->subDay(),
            'device_fingerprint' => Str::random(32),
            'app_version' => '1.0.0',
            'last_seen_at' => now(),
        ]);
    }
}
