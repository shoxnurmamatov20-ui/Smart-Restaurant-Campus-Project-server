<?php

declare(strict_types=1);

namespace Modules\Pos\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;
use Modules\Pos\Models\PosSyncEntry;
use Modules\Pos\Models\Terminal;

/**
 * @extends Factory<PosSyncEntry>
 */
final class PosSyncEntryFactory extends Factory
{
    protected $model = PosSyncEntry::class;

    public function definition(): array
    {
        return [
            'terminal_id' => Terminal::factory(),
            'local_id' => (string) Str::uuid(),
            'local_seq' => $this->faker->numberBetween(1, 500),
            'action' => 'bill.open',
            'payload' => ['channel' => 'dine_in'],
            'status' => 'accepted',
            'result' => ['id' => 1],
            'received_at' => now(),
        ];
    }

    public function pending(): static
    {
        return $this->state(fn (): array => ['status' => 'pending', 'result' => null]);
    }
}
