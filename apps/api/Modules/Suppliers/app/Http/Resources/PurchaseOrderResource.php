<?php

declare(strict_types=1);

namespace Modules\Suppliers\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Suppliers\Models\PurchaseOrder;

/**
 * @mixin PurchaseOrder
 */
final class PurchaseOrderResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'supplier_id' => $this->supplier_id,
            'supplier' => $this->whenLoaded('supplier', fn (): array => [
                'id' => $this->supplier->id,
                'name' => $this->supplier->name,
            ]),
            'number' => $this->number,
            'status' => $this->status,
            'expected_at' => $this->expected_at?->toIso8601String(),
            'received_at' => $this->received_at?->toIso8601String(),
            'total' => $this->total,
            'note' => $this->note,
            'items' => PurchaseOrderItemResource::collection($this->whenLoaded('items')),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
