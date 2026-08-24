<?php

declare(strict_types=1);

namespace Modules\Kitchen\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Kitchen\Models\KitchenTicket;

/**
 * @mixin KitchenTicket
 */
final class KitchenTicketResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            /*
             * The room this docket belongs to.
             *
             * The KDS reads it to know which branch channel to listen on. It
             * could have taken that from whoever is signed in, but that is right
             * only for a cook pinned to one venue and silently wrong for anyone
             * reading across several — and a screen listening to the wrong room
             * looks exactly like a screen with nothing happening in it.
             */
            'branch_id' => $this->branch_id,
            'order_id' => $this->order_id,
            'order_number' => $this->order_number,
            'station' => $this->station,
            'table_label' => $this->table_label,
            /*
             * Whose table it is, as the pass shouts it.
             *
             * Same shape as `OrderResource.waiter` on purpose — the KDS and the
             * console's order table draw the same column, and two shapes for one
             * fact is one of them being mapped wrong. `null` when the bill had
             * no waiter (takeaway, aggregator); `name` null when the endpoint
             * did not join, which a caller can tell apart from "nobody".
             */
            'waiter' => $this->waiter_user_id === null ? null : [
                'id' => $this->waiter_user_id,
                'name' => $this->relationLoaded('waiter') ? $this->waiter?->name : null,
            ],
            'channel' => $this->channel,
            'status' => $this->status,
            'lines' => $this->lines ?? [],
            'sla_minutes' => $this->sla_minutes,
            'elapsed_minutes' => $this->elapsed_minutes,
            'is_late' => $this->is_late,
            'started_at' => $this->started_at?->toIso8601String(),
            'ready_at' => $this->ready_at?->toIso8601String(),
            'served_at' => $this->served_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
