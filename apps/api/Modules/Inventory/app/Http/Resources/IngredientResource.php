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
            'barcode' => $this->barcode,
            'name' => $this->name,

            /*
             * Three fields about units, and the reader has to keep them apart.
             *
             * `unit` is the *base* unit every quantity on this row is counted
             * in — grams, millilitres, pieces, always whole numbers.
             * `purchase_unit` is what a storekeeper counts and a supplier
             * sells in, and `factor` is how many of the first make one of the
             * second. The console used to guess the last two from a lookup
             * table of unit names, which could not express a case of
             * twenty-four bottles.
             */
            'unit' => $this->unit,
            'purchase_unit' => $this->purchase_unit ?? $this->unit,
            'factor' => $this->factor,
            'stock_quantity' => $this->stock_quantity,
            'min_quantity' => $this->min_quantity,
            'is_low' => $this->is_low,
            'cost_per_unit' => $this->cost_per_unit,
            // Derived from the two above, never stored — see the model.
            'price_tiyin' => $this->price_tiyin,
            'stock_value' => $this->stock_value,
            'storage' => $this->storage,
            'store' => $this->store,
            'shelf_life_days' => $this->shelf_life_days,
            'is_active' => $this->is_active,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
