<?php

declare(strict_types=1);

namespace Modules\Staff\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Staff\Models\Shift;
use Modules\Staff\Models\StaffMember;

/**
 * @extends Factory<Shift>
 */
final class ShiftFactory extends Factory
{
    protected $model = Shift::class;

    public function definition(): array
    {
        return [
            'staff_member_id' => StaffMember::factory(),
            'starts_at' => now()->addDay()->setTime(10, 0),
            'ends_at' => now()->addDay()->setTime(22, 0),
            'status' => 'planned',
        ];
    }

    public function past(): static
    {
        return $this->state([
            'starts_at' => now()->subDays(2)->setTime(10, 0),
            'ends_at' => now()->subDays(2)->setTime(22, 0),
        ]);
    }
}
