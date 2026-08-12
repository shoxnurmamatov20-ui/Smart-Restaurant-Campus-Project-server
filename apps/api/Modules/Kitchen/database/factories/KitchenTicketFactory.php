<?php

declare(strict_types=1);

namespace Modules\Kitchen\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Kitchen\Models\KitchenTicket;

/**
 * @extends Factory<KitchenTicket>
 */
final class KitchenTicketFactory extends Factory
{
    protected $model = KitchenTicket::class;

    public function definition(): array
    {
        return [
            'order_id' => $this->faker->numberBetween(1, 999),
            'order_number' => 'A-'.$this->faker->unique()->numerify('####'),
            'station' => $this->faker->randomElement(['hot', 'grill', 'cold', 'bar']),
            'table_label' => strtoupper($this->faker->bothify('?-#')),
            'channel' => 'dine_in',
            'status' => 'new',
            'lines' => [['sku' => 'OSH-001', 'title' => 'Osh', 'quantity' => 2, 'note' => null]],
            'sla_minutes' => 20,
        ];
    }

    public function cooking(): static
    {
        return $this->state(['status' => 'cooking', 'started_at' => now()->subMinutes(5)]);
    }

    public function ready(): static
    {
        return $this->state(['status' => 'ready', 'started_at' => now()->subMinutes(10), 'ready_at' => now()]);
    }

    /** Started well past its SLA and still not out. */
    public function late(): static
    {
        return $this->state([
            'status' => 'cooking',
            'sla_minutes' => 10,
            'started_at' => now()->subMinutes(45),
        ]);
    }
}
