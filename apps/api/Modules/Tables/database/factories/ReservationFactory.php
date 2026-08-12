<?php

declare(strict_types=1);

namespace Modules\Tables\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Tables\Models\Reservation;
use Modules\Tables\Models\RestaurantTable;

/**
 * @extends Factory<Reservation>
 */
final class ReservationFactory extends Factory
{
    protected $model = Reservation::class;

    public function definition(): array
    {
        return [
            'restaurant_table_id' => RestaurantTable::factory(),
            'guest_name' => $this->faker->name(),
            'guest_phone' => '+998'.$this->faker->numerify('9########'),
            'guests_count' => $this->faker->numberBetween(1, 8),
            'starts_at' => now()->addHours($this->faker->numberBetween(1, 72)),
            'status' => 'pending',
            'source' => 'phone',
        ];
    }

    public function confirmed(): static
    {
        return $this->state(['status' => 'confirmed']);
    }

    public function cancelled(): static
    {
        return $this->state(['status' => 'cancelled']);
    }

    public function past(): static
    {
        return $this->state(['starts_at' => now()->subDay()]);
    }
}
