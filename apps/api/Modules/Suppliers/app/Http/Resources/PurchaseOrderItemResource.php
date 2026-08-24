<?php

declare(strict_types=1);

namespace Modules\Suppliers\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Suppliers\Models\PurchaseOrderItem;

/**
 * @mixin PurchaseOrderItem
 */
final class PurchaseOrderItemResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'purchase_order_id' => $this->purchase_order_id,
            'ingredient_id' => $this->ingredient_id,
            'name' => $this->name,
            'unit' => $this->unit,
            'quantity' => $this->quantity,
            /*
             * What was counted off the van, or null when nobody counted.
             *
             * Null is not zero and not "all of it": every delivery signed for
             * before the receiving screen learned to count carries it, as does
             * every one a storekeeper confirms whole from a phone. The console
             * draws an em dash for null and a real variance for a number —
             * printing the ordered figure here would manufacture a perfect
             * delivery on every line.
             */
            'received_quantity' => $this->received_quantity,
            'unit_price' => $this->unit_price,
            'total_price' => $this->total_price,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
