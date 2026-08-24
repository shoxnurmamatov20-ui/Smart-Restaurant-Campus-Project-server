<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Staff\Models\ShiftSwap;

/**
 * @mixin ShiftSwap
 */
final class ShiftSwapResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'shift_id' => $this->shift_id,
            'shift' => $this->whenLoaded('shift', fn (): array => [
                'id' => $this->shift->id,
                'starts_at' => $this->shift->starts_at->toIso8601String(),
                'ends_at' => $this->shift->ends_at->toIso8601String(),
                'role' => $this->shift->role,
            ]),
            'requested_by_id' => $this->requested_by_id,
            'requested_by' => $this->whenLoaded('requestedBy', fn (): array => [
                'id' => $this->requestedBy->id,
                'full_name' => $this->requestedBy->full_name,
                'position' => $this->requestedBy->position,
            ]),
            'offered_to_id' => $this->offered_to_id,
            'offered_to' => $this->whenLoaded('offeredTo', fn (): ?array => $this->offeredTo === null ? null : [
                'id' => $this->offeredTo->id,
                'full_name' => $this->offeredTo->full_name,
                'position' => $this->offeredTo->position,
            ]),
            'status' => $this->status,
            'reason' => $this->reason,
            'decided_by' => $this->decided_by,
            'decided_at' => $this->decided_at?->toIso8601String(),
            'decision_note' => $this->decision_note,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
