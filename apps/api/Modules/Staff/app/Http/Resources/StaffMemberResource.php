<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Staff\Models\StaffMember;

/**
 * @mixin StaffMember
 */
final class StaffMemberResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_code' => $this->employee_code,
            'full_name' => $this->full_name,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'phone' => $this->phone,
            'position' => $this->position,
            'branch_code' => $this->branch_code,
            'hourly_rate' => $this->hourly_rate,
            'status' => $this->status,
            'hired_at' => $this->hired_at?->toDateString(),
            'health_book_expires_at' => $this->health_book_expires_at?->toDateString(),
            'health_book_expired' => $this->health_book_expired,
            'user_id' => $this->user_id,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
