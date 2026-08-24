<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Crm\Models\Feedback;

/**
 * @mixin Feedback
 */
final class FeedbackResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'customer_id' => $this->customer_id,
            'order_id' => $this->order_id,
            /*
             * The four a review left at a table brings instead of an account.
             * `order_number` is what a manager can search for, because it is
             * what is printed on the guest's receipt; the two guest fields are
             * how they ring back about a one-star.
             */
            'table_id' => $this->table_id,
            'order_number' => $this->order_number,
            'guest_name' => $this->guest_name,
            'guest_phone' => $this->guest_phone,
            'score' => $this->score,
            'comment' => $this->comment,
            'aspect' => $this->aspect,
            'source' => $this->source,
            'is_urgent' => $this->is_urgent,
            'status' => $this->status,
            'resolved_at' => $this->resolved_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
