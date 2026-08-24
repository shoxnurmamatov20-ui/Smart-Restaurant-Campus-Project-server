<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Staff\Models\PayrollPeriod;

/**
 * @mixin PayrollPeriod
 */
final class PayrollPeriodResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'period' => $this->period,
            'branch_id' => $this->branch_id,

            /*
             * The window the lines were actually computed over, sent alongside
             * the month rather than left for the client to derive.
             *
             * It is what a disputed payslip turns on — "which days is this for"
             * — and a client that computed it from `period` would be answering
             * from its own calendar rather than from the run's.
             */
            'starts_on' => $this->starts_on->toDateString(),
            'ends_on' => $this->ends_on->toDateString(),

            'status' => $this->status,
            // One bit, so a screen does not have to know the ladder to decide
            // whether to draw an editable table or a printed one.
            'is_finalised' => $this->is_finalised,

            // Money, integer tiyin. Gross minus deductions is net, by
            // definition — all three are sent so a client never has to subtract.
            'gross_tiyin' => $this->gross_tiyin,
            'deductions_tiyin' => $this->deductions_tiyin,
            'net_tiyin' => $this->net_tiyin,

            'finalised_at' => $this->finalised_at?->toIso8601String(),
            // Who signed it off. A bare id, because the account it names may
            // since have been deleted and the signature has to outlive it.
            'finalised_by_user_id' => $this->finalised_by_user_id,
            'note' => $this->note,

            /*
             * The lines, only when the caller asked for them.
             *
             * The list screen shows thirty months and would otherwise carry a
             * thousand payslip lines nobody is looking at; the detail screen
             * loads one run and needs all of them.
             */
            'lines' => PayrollLineResource::collection($this->whenLoaded('lines')),
            'lines_count' => $this->whenCounted('lines'),

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
