<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Staff\Models\PayrollLine;

/**
 * @mixin PayrollLine
 */
final class PayrollLineResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'payroll_period_id' => $this->payroll_period_id,
            'staff_member_id' => $this->staff_member_id,

            /*
             * Who this line is about, embedded rather than left to a second
             * request.
             *
             * A payroll table is unreadable as a list of ids, and the client
             * that draws it would otherwise fetch thirty members one at a time
             * to render one screen. `whenLoaded` rather than a direct read, so a
             * caller that did not eager-load gets a missing key instead of an
             * N+1 nobody notices until the venue has staff.
             */
            'full_name' => $this->whenLoaded('member', fn (): ?string => $this->member?->full_name),
            'position' => $this->whenLoaded('member', fn (): ?string => $this->member?->position),
            'employee_code' => $this->whenLoaded('member', fn (): ?string => $this->member?->employee_code),

            // What was worked, and the rate it was worked at — the snapshot, not
            // whatever the member's record says today.
            'minutes_worked' => $this->minutes_worked,
            'hourly_rate' => $this->hourly_rate,

            // Money, integer tiyin throughout. Every component is sent rather
            // than the total alone: a payslip has to show its working, and a
            // question about a wage is always a question about one of these.
            'basic_tiyin' => $this->basic_tiyin,
            'service_charge_tiyin' => $this->service_charge_tiyin,
            'bonus_tiyin' => $this->bonus_tiyin,
            'deductions_tiyin' => $this->deductions_tiyin,
            'net_tiyin' => $this->net_tiyin,

            // The payslip's "period" block: turnouts, and how many of them
            // started late.
            'shifts_count' => $this->shifts_count,
            'late_count' => $this->late_count,

            'note' => $this->note,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
