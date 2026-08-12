<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Finance\Models\CashShift;

/**
 * @mixin CashShift
 */
final class CashShiftResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'opened_by_user_id' => $this->opened_by_user_id,
            'opened_at' => $this->opened_at?->toIso8601String(),
            'closed_at' => $this->closed_at?->toIso8601String(),
            'is_open' => $this->is_open,
            'opening_cash' => $this->opening_cash,
            'expected_cash' => $this->expected_cash,
            'counted_cash' => $this->counted_cash,
            'difference' => $this->difference,
            'total_takings' => $this->total_takings,
            'status' => $this->status,
            'note' => $this->note,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
