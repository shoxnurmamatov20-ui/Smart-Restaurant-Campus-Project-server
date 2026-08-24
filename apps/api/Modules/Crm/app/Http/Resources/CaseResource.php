<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Crm\Models\ComplaintCase;

/**
 * A complaint, as the decision desk reads it.
 *
 * `settles_itself` and `half_tiyin` come down already computed. Both are
 * arithmetic the console would otherwise repeat — the ceiling lives in
 * `config/crm.php` and the halving rounds to the nearest thousand so'm — and a
 * screen that computed either for itself would be a second place to be wrong
 * about a number a guest is told out loud.
 *
 * @mixin ComplaintCase
 */
final class CaseResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'branch_id' => $this->branch_id,
            'channel' => $this->channel,
            'kind' => $this->kind,

            'customer_id' => $this->customer_id,
            // The account's name first, then whatever the form was given — the
            // same order `crm-server.ts` applies to a review, and for the same
            // reason: a complaint that DID leave a name is not anonymous.
            'guest_name' => $this->customer->name ?? $this->guest_name,
            'guest_phone' => $this->customer->phone ?? $this->guest_phone,
            'guest_visits' => $this->customer?->visits_count,

            'order_id' => $this->order_id,
            'order_number' => $this->order_number,

            'amount_tiyin' => $this->amount_tiyin,
            'amount_note' => $this->amount_note,
            'half_tiyin' => $this->halfOfAmount(),
            'settles_itself' => $this->settlesItself(),

            'quote' => $this->quote,
            'photos' => $this->photos ?? [],

            'status' => $this->status,
            'assigned_to_user_id' => $this->assigned_to_user_id,
            'assigned_to' => $this->assignee?->name,
            'due_at' => $this->due_at?->toIso8601String(),
            'is_overdue' => $this->isOverdue(),

            'outcome' => $this->outcome,
            'outcome_tiyin' => $this->outcome_tiyin,
            'decided_by' => $this->decidedBy?->name,
            'decided_at' => $this->decided_at?->toIso8601String(),

            'feedback_id' => $this->feedback_id,
            'events' => CaseEventResource::collection($this->whenLoaded('events')),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
