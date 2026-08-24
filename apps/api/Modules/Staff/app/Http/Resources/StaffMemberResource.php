<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Carbon;
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
            'branch_id' => $this->branch_id,
            'branch_code' => $this->branch_code,
            'hourly_rate' => $this->hourly_rate,
            'status' => $this->status,
            'hired_at' => $this->hired_at?->toDateString(),
            'health_book_expires_at' => $this->health_book_expires_at?->toDateString(),
            'health_book_expired' => $this->health_book_expired,
            'user_id' => $this->user_id,

            /*
             * The three derived roster columns, and only when the caller asked
             * for them — `StaffMember::scopeWithRosterFigures`.
             *
             * Left out rather than defaulted. A list that has not loaded the
             * figures should say so by omission; answering "0% turnout" for a
             * cook who has never missed a shift is worse than answering
             * nothing, because a manager cannot tell it apart from the truth.
             */
            'shifts_due' => $this->whenNotNull($this->figure('shifts_due_count')),
            'shifts_attended' => $this->whenNotNull($this->figure('shifts_attended_count')),
            /*
             * A percentage, and `null` for somebody with no rostered shifts
             * behind them in the window. Zero would read as "never turns up",
             * which is the opposite of what an empty history means — and this
             * is the column a manager sorts by.
             */
            'attendance_rate' => $this->when(
                $this->figure('shifts_due_count') !== null,
                fn (): ?int => $this->attendanceRate(),
            ),
            'last_shift_at' => $this->when(
                $this->resource->getAttribute('last_shift_at') !== null,
                fn (): ?string => $this->lastShiftAt(),
            ),
            // One bit: can this person sign in at a till or on their own phone.
            'has_pin' => $this->when(
                $this->figure('has_pin') !== null,
                fn (): bool => ($this->figure('has_pin') ?? 0) > 0,
            ),

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }

    /** A subquery result as an integer, or null when it was not selected. */
    private function figure(string $key): ?int
    {
        $value = $this->resource->getAttribute($key);

        return $value === null ? null : (int) $value;
    }

    private function attendanceRate(): ?int
    {
        $due = $this->figure('shifts_due_count') ?? 0;

        if ($due === 0) {
            return null;
        }

        return (int) round(($this->figure('shifts_attended_count') ?? 0) * 100 / $due);
    }

    private function lastShiftAt(): ?string
    {
        $value = $this->resource->getAttribute('last_shift_at');

        return $value === null ? null : Carbon::parse((string) $value)->toIso8601String();
    }
}
