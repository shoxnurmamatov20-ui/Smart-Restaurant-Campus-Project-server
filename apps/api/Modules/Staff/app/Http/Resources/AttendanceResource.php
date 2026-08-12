<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Staff\Models\Attendance;

/**
 * @mixin Attendance
 */
final class AttendanceResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'staff_member_id' => $this->staff_member_id,
            'checked_in_at' => $this->checked_in_at?->toIso8601String(),
            'checked_out_at' => $this->checked_out_at?->toIso8601String(),
            'is_open' => $this->is_open,
            'method' => $this->method,
            'minutes_worked' => $this->minutes_worked,
            'earned_tiyin' => $this->earned_tiyin,
            'is_late' => $this->is_late,
            'note' => $this->note,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
