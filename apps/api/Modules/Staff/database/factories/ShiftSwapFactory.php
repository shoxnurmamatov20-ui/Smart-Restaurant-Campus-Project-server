<?php

declare(strict_types=1);

namespace Modules\Staff\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Staff\Models\Shift;
use Modules\Staff\Models\ShiftSwap;
use Modules\Staff\Models\StaffMember;

/**
 * @extends Factory<ShiftSwap>
 */
final class ShiftSwapFactory extends Factory
{
    protected $model = ShiftSwap::class;

    public function definition(): array
    {
        return [
            'shift_id' => Shift::factory(),
            'requested_by_id' => StaffMember::factory(),
            // Open by default, which is the common case: somebody posts the
            // shift to whoever will take it rather than naming a colleague.
            'offered_to_id' => null,
            'status' => 'pending',
            'reason' => 'Oilaviy sabab',
        ];
    }

    public function offeredTo(StaffMember $member): static
    {
        return $this->state(['offered_to_id' => $member->id]);
    }

    public function decided(string $status): static
    {
        return $this->state(['status' => $status, 'decided_at' => now()]);
    }
}
