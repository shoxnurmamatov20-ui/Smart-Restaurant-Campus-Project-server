<?php

declare(strict_types=1);

namespace Modules\Staff\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Staff\Models\StaffMember;

/**
 * @extends Factory<StaffMember>
 */
final class StaffMemberFactory extends Factory
{
    protected $model = StaffMember::class;

    public function definition(): array
    {
        return [
            'employee_code' => strtoupper($this->faker->unique()->bothify('EMP-####')),
            'first_name' => $this->faker->firstName(),
            'last_name' => $this->faker->lastName(),
            'phone' => '+998'.$this->faker->numerify('9########'),
            'position' => $this->faker->randomElement(['waiter', 'cook', 'cashier', 'bartender']),
            'hourly_rate' => $this->faker->numberBetween(1500000, 4000000),
            'status' => 'active',
            'hired_at' => now()->subMonths($this->faker->numberBetween(1, 36)),
        ];
    }

    public function onLeave(): static
    {
        return $this->state(['status' => 'on_leave']);
    }

    public function terminated(): static
    {
        return $this->state(['status' => 'terminated', 'terminated_at' => now()->subDays(10)]);
    }

    public function expiredHealthBook(): static
    {
        return $this->state(['health_book_expires_at' => now()->subDays(5)]);
    }
}
