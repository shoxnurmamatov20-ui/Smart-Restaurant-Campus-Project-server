<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Finance\Models\AccountingPeriod;

/**
 * @mixin AccountingPeriod
 */
final class AccountingPeriodResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'period' => $this->period,
            'starts_on' => $this->starts_on->toDateString(),
            'ends_on' => $this->ends_on->toDateString(),
            'status' => $this->status,
            /*
             * The frozen figures, and they are frozen — see the migration. An
             * open period publishes what it has so far, which is the running
             * total; a closed one publishes what was signed, which no longer
             * moves even when a refund lands in the rows behind it.
             */
            'revenue_tiyin' => $this->revenue_tiyin,
            'expenses_tiyin' => $this->expenses_tiyin,
            'closed_at' => $this->closed_at?->toIso8601String(),
            'closed_by_user_id' => $this->closed_by_user_id,
            'reopened_at' => $this->reopened_at?->toIso8601String(),
            'note' => $this->note,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
