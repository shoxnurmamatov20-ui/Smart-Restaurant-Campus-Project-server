<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Marketplace\Models\Store;

/**
 * One card in the marketplace directory.
 *
 * @mixin Store
 */
final class StoreResource extends JsonResource
{
    /**
     * How far the asker is from this shop, in metres, or null.
     *
     * Passed in rather than read off the model, because it is not a property of
     * the shop: it is the distance between the shop and whoever is looking. See
     * the migration for why no column holds it.
     */
    public function __construct(Store $store, private readonly ?int $metres = null)
    {
        parent::__construct($store);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'slug' => $this->slug,
            'name' => $this->name,

            // Both shapes, the same way MenuItemResource does it: `kind` is the
            // full locale map an editor needs, and the reader picks their own.
            'kind' => $this->kind,

            'cuisine' => $this->cuisine,
            'vertical' => $this->vertical,

            'rating' => $this->rating(),
            'reviews_count' => $this->reviews_count,

            'delivery_fee_tiyin' => $this->delivery_fee_tiyin,
            'min_order_tiyin' => $this->min_order_tiyin,

            // The window the card prints, both ends — `MP.window` renders it as
            // "25–35 daq" and needs the two numbers rather than a sentence.
            'minutes_from' => $this->minutes_from,
            'minutes_to' => $this->minutes_to,

            'offer' => $this->offer,
            'offer_tone' => $this->offer_tone,

            /*
             * Two different closings, and the card draws them differently.
             * `is_open` is the shop's own switch — dimmed, with "Yopiq" over it.
             * A storefront that is not `live` never reaches this resource at
             * all, because the directory scope refuses it.
             */
            'is_open' => $this->is_open,

            'initials' => $this->initials,
            'tint' => $this->tint,
            'logo_url' => $this->logo_url,
            'cover_url' => $this->cover_url,

            // Null unless the request said where it was asking from.
            'distance_metres' => $this->metres,
        ];
    }
}
