<?php

declare(strict_types=1);

namespace Modules\Kitchen\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Kitchen\Models\Printer;

/**
 * @extends Factory<Printer>
 */
final class PrinterFactory extends Factory
{
    protected $model = Printer::class;

    public function definition(): array
    {
        return [
            'code' => 'p-'.$this->faker->unique()->numberBetween(1, 99999),
            'name' => $this->faker->randomElement(['Pass', 'Grill', 'Bar', 'Kassa']).' printeri',
            'role' => 'kitchen',
            'connection' => 'agent',
            'target' => '10.0.0.'.$this->faker->numberBetween(2, 254).':9100',
            'columns' => 48,
            'codepage' => 'cp866',
            'cuts' => true,
            'opens_drawer' => false,
            'copies' => 1,
            'is_active' => true,
            'is_default' => false,
        ];
    }

    /** The one at the counter: guest receipts, and the drawer under it. */
    public function receipt(): self
    {
        return $this->state(fn (): array => [
            'role' => 'receipt',
            'name' => 'Kassa printeri',
            'opens_drawer' => true,
            'is_default' => true,
        ]);
    }

    public function kitchen(): self
    {
        return $this->state(fn (): array => ['role' => 'kitchen']);
    }

    /** What the branch falls back to when a station names no printer. */
    public function default(): self
    {
        return $this->state(fn (): array => ['is_default' => true]);
    }

    /** A 58 mm roll — 32 columns, which is where layout bugs surface. */
    public function narrow(): self
    {
        return $this->state(fn (): array => ['columns' => 32]);
    }

    /** Heard from just now, so `state` reads `ready` rather than `offline`. */
    public function online(): self
    {
        return $this->state(fn (): array => ['last_seen_at' => now()]);
    }

    public function failing(string $error = 'Qog\'oz tugadi'): self
    {
        return $this->state(fn (): array => [
            'last_seen_at' => now(),
            'failing_since' => now()->subMinutes(3),
            'last_error' => $error,
        ]);
    }
}
