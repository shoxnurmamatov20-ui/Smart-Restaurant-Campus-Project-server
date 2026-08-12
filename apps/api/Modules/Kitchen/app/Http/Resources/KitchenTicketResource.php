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
            'order_id' => $this->order_id,
            'order_number' => $this->order_number,
            'station' => $this->station,
            'table_label' => $this->table_label,
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
