<?php

declare(strict_types=1);

namespace Modules\Inventory\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Inventory\Models\StockTransfer;
use Modules\Inventory\Models\StockTransferLine;

/**
 * @mixin StockTransfer
 */
final class StockTransferResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'status' => $this->status,
            'from' => [
                'id' => $this->from_branch_id,
                'name' => $this->fromBranch?->name,
            ],
            'to' => [
                'id' => $this->to_branch_id,
                'name' => $this->toBranch?->name,
            ],
            'note' => $this->note,
            'value_tiyin' => $this->value_tiyin,
            'lines' => $this->lines->map(static fn (StockTransferLine $line): array => [
                'ingredient_id' => $line->ingredient_id,
                'name' => $line->ingredient?->name,
                'unit' => $line->ingredient?->unit,
                'quantity' => $line->quantity,
                'unit_cost_tiyin' => $line->unit_cost_tiyin,
                'value_tiyin' => $line->value_tiyin,
            ])->all(),
            'sent_at' => $this->sent_at?->toIso8601String(),
            'received_at' => $this->received_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
