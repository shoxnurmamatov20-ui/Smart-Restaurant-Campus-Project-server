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
            // Not always the same person: a shift that runs past a handover is
            // closed by whoever took it over, and "the cashier was short" would
            // otherwise name the wrong one.
            'closed_by_user_id' => $this->closed_by_user_id,
            'approved_by_user_id' => $this->approved_by_user_id,
            'opened_at' => $this->opened_at?->toIso8601String(),
            'locked_at' => $this->locked_at?->toIso8601String(),
            'closed_at' => $this->closed_at?->toIso8601String(),
            'is_open' => $this->is_open,
            // Counting has begun and the drawer takes no more money. A client
            // that only knew `is_open` would show a sell button that refuses.
            'is_locked' => $this->is_locked,
            'opening_cash' => $this->opening_cash,
            'expected_cash' => $this->expected_cash,
            'counted_cash' => $this->counted_cash,
            'difference' => $this->difference,
            'difference_reason' => $this->difference_reason,
            'handed_over_to_shift_id' => $this->handed_over_to_shift_id,
            'total_takings' => $this->total_takings,
            'status' => $this->status,
            'note' => $this->note,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
