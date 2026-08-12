<?php

declare(strict_types=1);

namespace Modules\Orders\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Orders\Models\Order;

/**
 * @mixin Order
 */
final class OrderResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'channel' => $this->channel,
            'status' => $this->status,
            'is_open' => $this->is_open,
            'table' => [
                'id' => $this->restaurant_table_id,
                'label' => $this->table_label,
            ],
            'waiter_user_id' => $this->waiter_user_id,
            'customer_id' => $this->customer_id,
            'guests_count' => $this->guests_count,
            'subtotal' => $this->subtotal,
            'discount_total' => $this->discount_total,
            'service_charge' => $this->service_charge,
            'total' => $this->total,
            'total_uzs' => $this->total_uzs,
            'currency' => 'UZS',
            'placed_at' => $this->placed_at?->toIso8601String(),
            'closed_at' => $this->closed_at?->toIso8601String(),
            'note' => $this->note,
            'items' => OrderItemResource::collection($this->whenLoaded('items')),
            'items_count' => $this->whenCounted('items'),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
