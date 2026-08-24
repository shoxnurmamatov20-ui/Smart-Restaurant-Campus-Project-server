<?php

declare(strict_types=1);

namespace Modules\Marketplace\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Marketplace\Models\Consumer;

/**
 * @extends Factory<Consumer>
 */
final class ConsumerFactory extends Factory
{
    protected $model = Consumer::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            // E.164 and unique. Built from the sequence rather than faker's own
            // phone generator, which produces numbers that are not Uzbek and
            // collide often enough to break a test suite at random.
            'phone' => '+9989'.$this->faker->unique()->numberBetween(10_000_000, 99_999_999),
            'name' => $this->faker->randomElement(['Nilufar Yusupova', 'Oybek Saidov', 'Dilnoza Aliyeva', 'Jasur Rahimov']),
            'locale' => 'uz',
            'is_active' => true,
            'points' => 0,
        ];
    }

    /** A MyPOS Plus subscriber — free delivery, whatever the basket. */
    public function plus(): self
    {
        return $this->state(fn (): array => ['plus_until' => now()->addMonth()]);
    }

    /** Blocked: the credential still works and the account does not. */
    public function blocked(): self
    {
        return $this->state(fn (): array => ['is_active' => false]);
    }
}
