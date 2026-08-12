<?php

declare(strict_types=1);

namespace Modules\Staff\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Staff\Models\Attendance;
use Modules\Staff\Models\StaffMember;

/**
 * @extends Factory<Attendance>
 */
final class AttendanceFactory extends Factory
{
    protected $model = Attendance::class;

    public function definition(): array
    {
        return [
            'staff_member_id' => StaffMember::factory(),
            'checked_in_at' => now()->subHours(4),
            'method' => 'pin',
            'minutes_worked' => 0,
            'is_late' => false,
        ];
    }

    public function closed(): static
    {
        return $this->state([
            'checked_out_at' => now(),
            'minutes_worked' => 240,
        ]);
    }

    public function late(): static
    {
        return $this->state(['is_late' => true]);
    }
}
