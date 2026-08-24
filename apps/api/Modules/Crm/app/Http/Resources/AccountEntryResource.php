<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Crm\Models\AccountEntry;

/**
 * @mixin AccountEntry
 */
final class AccountEntryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'customer_id' => $this->customer_id,
            'branch_id' => $this->branch_id,
            'business_date' => $this->business_date?->toDateString(),
            'kind' => $this->kind,
            'amount' => $this->amount,
            'balance_after' => $this->balance_after,
            'order_id' => $this->order_id,
            'order_number' => $this->order_number,
            'payment_id' => $this->payment_id,
            // The manager's signature, when the charge went over the limit. Sent
            // as the id rather than resolved to a name: CRM cannot read
            // `pos.approvals`, and inventing a name here would be a claim the
            // module has no way to stand behind.
            'approval_id' => $this->approval_id,
            'recorded_by_user_id' => $this->recorded_by_user_id,
            'note' => $this->note,
            'occurred_at' => $this->occurred_at->toIso8601String(),
        ];
    }
}
