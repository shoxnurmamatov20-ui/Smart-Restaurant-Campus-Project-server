<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Crm\Models\Promotion;

/**
 * An offer, as the promotions tab draws it.
 *
 * `margin_percent` is computed here and never stored, and the arithmetic is the
 * honest one: what the offer left after what it gave away, against what it
 * brought in. It is NOT food-cost margin — that lives in Inventory's recipes and
 * this module cannot see it — so the field is named for what it is and the
 * console labels it accordingly. A number called "margin" that silently meant
 * something else is how a marketer keeps an offer that is losing money.
 *
 * `null` when nothing has been sold on the offer yet: zero would read as "this
 * offer makes no margin", which is the opposite of "nobody has used it".
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
            'branch_id' => $this->branch_id,
            'name' => $this->name,
            'rule_text' => $this->rule_text,
            'kind' => $this->kind,
            'value' => $this->value,
            'min_tiyin' => $this->min_tiyin,
            'quantity' => $this->quantity,
            'dishes' => $this->dishes ?? [],
            'days' => $this->days ?? [],
            'starts_minute' => $this->starts_minute,
            'ends_minute' => $this->ends_minute,
            'channels' => $this->channels ?? [],
            'starts_on' => $this->starts_on?->toDateString(),
            'ends_on' => $this->ends_on?->toDateString(),
            'is_active' => $this->is_active,
            'used_count' => $this->used_count,
            'revenue_tiyin' => $this->revenue_tiyin,
            'discount_tiyin' => $this->discount_tiyin,
            'margin_percent' => $this->revenue_tiyin > 0
                ? round(($this->revenue_tiyin - $this->discount_tiyin) * 100 / $this->revenue_tiyin, 1)
                : null,
            'runs_now' => $this->runsAt(now()),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
