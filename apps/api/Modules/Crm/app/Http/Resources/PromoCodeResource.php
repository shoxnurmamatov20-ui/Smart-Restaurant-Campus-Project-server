<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Crm\Models\PromoCode;

/**
 * A campaign, as a marketer's screen reads it.
 *
 * `used_count` and `max_uses` both come down, and `remaining` beside them. The
 * subtraction is here rather than in the client for the reason it usually is:
 * `max_uses` is nullable and means unlimited, so a client doing the arithmetic
 * has to remember that null minus a number is not a small number.
 *
 * @mixin PromoCode
 */
final class PromoCodeResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'title' => $this->title,
            'kind' => $this->kind,
            'value' => $this->value,
            'min_tiyin' => $this->min_tiyin,
            'max_discount_tiyin' => $this->max_discount_tiyin,
            'starts_at' => $this->starts_at?->toIso8601String(),
            'ends_at' => $this->ends_at?->toIso8601String(),
            'max_uses' => $this->max_uses,
            'used_count' => $this->used_count,
            'remaining' => $this->max_uses === null ? null : max(0, $this->max_uses - $this->used_count),
            'per_customer_limit' => $this->per_customer_limit,
            'is_active' => $this->is_active,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
