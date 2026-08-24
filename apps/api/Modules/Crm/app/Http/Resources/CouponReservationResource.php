<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Crm\Models\CouponReservation;

/**
 * A coupon a guest is holding — the receipt for the points they spent.
 *
 * @mixin CouponReservation
 */
final class CouponReservationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            // The string the guest types into a cart. The point of the whole row.
            'code' => $this->code,
            'points_spent' => $this->points_spent,
            'expires_at' => $this->expires_at?->toIso8601String(),
            'redeemed_at' => $this->redeemed_at?->toIso8601String(),
            'coupon' => new CouponResource($this->whenLoaded('coupon')),
        ];
    }
}
