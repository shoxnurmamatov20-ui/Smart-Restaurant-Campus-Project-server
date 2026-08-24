<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Marketplace\Models\Promotion;

/**
 * A merchant's own offer and what is left of its budget.
 *
 * @mixin Promotion
 */
final class PromotionResource extends JsonResource
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
            'body' => $this->body,

            'kind' => $this->kind,
            'state' => $this->state,

            'discount_tiyin' => $this->discount_tiyin,
            'budget_tiyin' => $this->budget_tiyin,
            'spent_tiyin' => $this->spent_tiyin,

            // Never negative: an offer that overspent by a rounding tiyin should
            // read "nothing left", not "minus one".
            'remaining_tiyin' => $this->remaining(),

            'starts_on' => $this->starts_on?->toDateString(),
            'ends_on' => $this->ends_on?->toDateString(),
        ];
    }
}
