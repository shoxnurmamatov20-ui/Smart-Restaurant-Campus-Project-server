<?php

declare(strict_types=1);

namespace Modules\Inventory\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Inventory\Models\Ingredient;

/**
 * @mixin Ingredient
 */
final class IngredientResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'sku' => $this->sku,
            'name' => $this->name,
            'unit' => $this->unit,
            'stock_quantity' => $this->stock_quantity,
            'min_quantity' => $this->min_quantity,
            'is_low' => $this->is_low,
            'cost_per_unit' => $this->cost_per_unit,
            'stock_value' => $this->stock_value,
            'storage' => $this->storage,
            'shelf_life_days' => $this->shelf_life_days,
            'is_active' => $this->is_active,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
