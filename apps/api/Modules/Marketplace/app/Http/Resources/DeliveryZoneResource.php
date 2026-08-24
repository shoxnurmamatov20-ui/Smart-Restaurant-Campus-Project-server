<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Marketplace\Models\DeliveryZone;

/**
 * One circle a storefront delivers inside.
 *
 * Metres come out as kilometres and microdegrees as ordinary degrees, because
 * this is read by a map on a phone and by a merchant's settings form, and both
 * of them think in the units a person types. The storage units exist so that no
 * float is ever written; the wire units exist so that no client has to divide by
 * a million.
 *
 * @mixin DeliveryZone
 */
final class DeliveryZoneResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'label' => $this->label,

            'radius_km' => $this->radiusKm(),
            'latitude' => $this->latitude(),
            'longitude' => $this->longitude(),

            // Null means "the storefront's own", which the client already has.
            // Sending the fallback here would hide the fact that this zone does
            // not set one, and a merchant editing it would then set it by
            // accident the next time they saved.
            'fee_tiyin' => $this->fee_tiyin,
            'min_order_tiyin' => $this->min_order_tiyin,
        ];
    }
}
