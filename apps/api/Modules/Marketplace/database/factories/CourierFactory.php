<?php

declare(strict_types=1);

namespace Modules\Marketplace\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Marketplace\Models\Courier;

/**
 * @extends Factory<Courier>
 */
final class CourierFactory extends Factory
{
    protected $model = Courier::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => $this->faker->randomElement(['Oybek S.', 'Rustam T.', 'Aziz K.', 'Bekzod M.']),
            'phone' => '+9989'.$this->faker->unique()->numberBetween(10_000_000, 99_999_999),
            'rating_tenths' => $this->faker->numberBetween(45, 50),
            'deliveries_count' => $this->faker->numberBetween(100, 3_000),
            'is_active' => true,
        ];
    }

    /** Somewhere in Tashkent, reported just now — so `position()` answers. */
    public function located(): self
    {
        return $this->state(fn (): array => [
            'last_latitude_e6' => 41_316_000,
            'last_longitude_e6' => 69_248_000,
            'located_at' => now(),
        ]);
    }
}
