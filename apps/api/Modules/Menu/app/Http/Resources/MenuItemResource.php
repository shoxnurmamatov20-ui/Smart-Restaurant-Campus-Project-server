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

            /*
             * Both shapes, and they answer the same question at two depths.
             *
             * `image_url` is one address — the platform's largest rendition
             * when it holds the photograph, the typed-in address when it does
             * not — for the nineteen readers that know only that name. `image`
             * is the set: every size with its own address and dimensions, and
             * a placeholder to paint before the bytes arrive. Null when the
             * platform does not hold the photograph, which is also what it
             * says for a dish whose picture lives on somebody else's host.
             */
            'image_url' => $this->imageUrl(),
            'image' => $this->imageSet()?->toArray(),
            'sort_order' => $this->sort_order,
            'channels' => $this->channels ?? MenuItem::CHANNELS,

            /*
             * What the guest is asked before this can be ordered.
             *
             * Only when the caller loaded it, which is exactly one caller today:
             * the public menu, which needs the sheet in the same payload because a
             * phone on a café's Wi-Fi should not pay a round trip to find out
             * whether a dish has sizes. The till asks separately, per dish — see
             * PosMenuController, which explains why the two differ.
             *
             * Absent rather than empty when nobody loaded it: a `[]` here would
             * tell an editor screen this dish has no questions when the truth is
             * that nobody asked.
             */
            'modifier_groups' => ModifierGroupResource::collection($this->whenLoaded('modifierGroups')),

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
