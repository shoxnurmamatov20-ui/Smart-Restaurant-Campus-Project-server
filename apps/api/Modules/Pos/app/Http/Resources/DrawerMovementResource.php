<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Pos\Models\DrawerMovement;

/**
 * @mixin DrawerMovement
 */
final class DrawerMovementResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'terminal_id' => $this->terminal_id,
            'cash_shift_id' => $this->cash_shift_id,
            'kind' => $this->kind,
            'amount' => $this->amount,
            'direction' => $this->direction,
            'signed_amount' => $this->signed_amount,
            'reason' => $this->reason,
            'approval_id' => $this->approval_id,
            // Proof that an outgoing movement reached Finance — without it the
            // Z-report would read the collection as a shortfall.
            'finance_expense_id' => $this->finance_expense_id,

            'user' => $this->whenLoaded('user', fn (): array => [
                'id' => $this->user->id,
                'name' => $this->user->name,
            ]),

            'occurred_at' => $this->occurred_at?->toIso8601String(),
        ];
    }
}
