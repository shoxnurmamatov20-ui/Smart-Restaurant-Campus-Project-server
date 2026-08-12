<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Pos\Models\PosApproval;

/**
 * @mixin PosApproval
 */
final class PosApprovalResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'terminal_id' => $this->terminal_id,
            'action' => $this->action,
            'subject_type' => $this->subject_type,
            'subject_id' => $this->subject_id,
            'amount' => $this->amount,
            'reason' => $this->reason,
            'status' => $this->status,
            'method' => $this->method,
            'is_spendable' => $this->is_spendable,

            'requested_by' => $this->whenLoaded('requestedBy', fn (): array => [
                'id' => $this->requestedBy->id,
                'name' => $this->requestedBy->name,
            ]),
            'approved_by' => $this->whenLoaded('approvedBy', fn (): ?array => $this->approvedBy === null ? null : [
                'id' => $this->approvedBy->id,
                'name' => $this->approvedBy->name,
            ]),
            'terminal' => new TerminalResource($this->whenLoaded('terminal')),

            'requested_at' => $this->requested_at?->toIso8601String(),
            'decided_at' => $this->decided_at?->toIso8601String(),
            'expires_at' => $this->expires_at?->toIso8601String(),
            'used_at' => $this->used_at?->toIso8601String(),
        ];
    }
}
