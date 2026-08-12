<?php

declare(strict_types=1);

namespace Modules\Menu\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Menu\Models\MenuItem;

/**
 * @mixin MenuItem
 */
final class MenuItemResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'sku' => $this->sku,

            // Both shapes on purpose: `title` is what a POS button or a QR menu
            // renders straight away; `name` is the full locale map an editor needs.
            'title' => $this->title,
            'name' => $this->name,
            'description' => $this->description,

            'category' => [
                'id' => $this->menu_category_id,
                'title' => $this->whenLoaded('category', fn (): ?string => $this->category->title),
                'slug' => $this->whenLoaded('category', fn (): string => $this->category->slug),
            ],

            'kind' => $this->kind,

            'price' => $this->price,
            'price_uzs' => $this->price_uzs,
            'cost_price' => $this->cost_price,
            'margin_percent' => $this->margin_percent,
            'currency' => $this->currency,

            'cook_time_minutes' => $this->cook_time_minutes,
            'station' => $this->station,

            'weight_grams' => $this->weight_grams,
            'calories' => $this->calories,
            'allergens' => $this->allergens ?? [],
            'is_halal' => $this->is_halal,
            'is_vegetarian' => $this->is_vegetarian,
            'spice_level' => $this->spice_level,

            'is_available' => $this->is_available,
            'is_orderable' => $this->is_orderable,
            'stopped_until' => $this->stopped_until?->toIso8601String(),
            'status' => $this->status,

            'image_url' => $this->image_url,
            'sort_order' => $this->sort_order,
            'channels' => $this->channels ?? MenuItem::CHANNELS,

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
