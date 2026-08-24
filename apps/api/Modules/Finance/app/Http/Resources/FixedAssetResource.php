<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Finance\Models\FixedAsset;

/**
 * @mixin FixedAsset
 */
final class FixedAssetResource extends JsonResource
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
            'category' => $this->category,
            'acquired_on' => $this->acquired_on->toDateString(),
            'cost' => $this->cost,
            'residual' => $this->residual,
            'useful_life_months' => $this->useful_life_months,
            'monthly_charge' => $this->monthlyCharge(),
            'disposed_on' => $this->disposed_on?->toDateString(),
            'note' => $this->note,
            /*
             * Written off so far, and what is left, as of the month the
             * controller asked about.
             *
             * Computed there and attached, rather than derived here: a resource
             * that reached for the current month would answer a different
             * question than the register it is being drawn in, and a register
             * for March showing April's accumulated figures is the kind of error
             * nobody spots until an audit.
             */
            'accumulated' => $this->whenHas('accumulated', fn (): int => (int) $this->getAttribute('accumulated')),
            'book_value' => $this->whenHas('book_value', fn (): int => (int) $this->getAttribute('book_value')),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
