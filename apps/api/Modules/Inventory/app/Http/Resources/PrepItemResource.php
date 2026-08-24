<?php

declare(strict_types=1);

namespace Modules\Inventory\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Inventory\Models\PrepComponent;
use Modules\Inventory\Models\PrepItem;

/**
 * @mixin PrepItem
 */
final class PrepItemResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'unit' => $this->unit,
            'batch_quantity' => $this->batch_quantity,
            'loss_percent' => $this->loss_percent,
            // The yield and both costs are derived, never stored. See PrepItem:
            // a second column holding "cost per gram" is a number that disagrees
            // with the components the first time beef gets more expensive.
            'yield' => $this->usable_yield,
            'shelf_life_days' => $this->shelf_life_days,
            'on_hand' => $this->on_hand,
            'batch_cost_tiyin' => $this->batch_cost,
            'unit_cost_tiyin' => $this->unit_cost,
            'is_active' => $this->is_active,
            'components' => $this->components->map(static fn (PrepComponent $line): array => [
                'ingredient_id' => $line->ingredient_id,
                'name' => $line->ingredient?->name,
                'unit' => $line->ingredient?->unit,
                'quantity' => $line->quantity,
                'cost_per_unit' => $line->ingredient?->cost_per_unit,
            ])->all(),
        ];
    }
}
