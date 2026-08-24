<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Crm\Models\Coupon;

/**
 * One row of the loyalty shelf, as the design's loyalty screen draws it.
 *
 * `name` and `note` come down as the whole `{uz,ru,en}` object rather than
 * resolved. The customer app already holds a language the guest chose on its
 * own profile screen, and it re-renders when they change it — resolving here
 * would mean the coupon list stayed in the language of whatever `Accept-Language`
 * the phone sent until the next page load.
 *
 * @mixin Coupon
 */
final class CouponResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'key' => $this->key,
            'name' => $this->name,
            'note' => $this->note,
            'points_cost' => $this->points_cost,
            'kind' => $this->kind,
            'value' => $this->value,
            'min_tiyin' => $this->min_tiyin,
            // The rail colour down the left edge — one of the design's four
            // accents. See the migration for why a marketer owns this.
            'tone' => $this->tone,
            'ends_at' => $this->ends_at?->toIso8601String(),
        ];
    }
}
