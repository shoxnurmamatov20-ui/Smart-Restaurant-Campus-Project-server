<?php

declare(strict_types=1);

namespace Modules\Tables\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Tables\Models\Hall;
use Modules\Tables\Models\RestaurantTable;

/**
 * @extends Factory<RestaurantTable>
 */
final class RestaurantTableFactory extends Factory
{
    protected $model = RestaurantTable::class;

    public function definition(): array
    {
        return [
            'hall_id' => Hall::factory(),
            'label' => strtoupper($this->faker->unique()->bothify('?-##')),
            'seats' => $this->faker->randomElement([2, 4, 4, 6, 8]),
            'kind' => 'regular',
            'status' => 'free',
            'qr_token' => bin2hex(random_bytes(16)),
            'is_active' => true,
        ];
    }

    public function occupied(): static
    {
        return $this->state(['status' => 'occupied']);
    }

    public function reserved(): static
    {
        return $this->state(['status' => 'reserved']);
    }

    public function vip(): static
    {
        return $this->state(['kind' => 'vip', 'seats' => 10]);
    }

    public function inHall(Hall $hall): static
    {
        return $this->state(['hall_id' => $hall->id]);
    }
}
