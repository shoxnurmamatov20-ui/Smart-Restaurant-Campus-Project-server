<?php

declare(strict_types=1);

namespace Modules\Suppliers\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Suppliers\Models\Supplier;

/**
 * @mixin Supplier
 */
final class SupplierResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'category' => $this->category,
            'contact_name' => $this->contact_name,
            'phone' => $this->phone,
            'email' => $this->email,
            'payment_terms_days' => $this->payment_terms_days,
            'lead_time_days' => $this->lead_time_days,
            'rating' => $this->rating,
            'debt' => $this->debt,
            'last_delivery_at' => $this->last_delivery_at?->toIso8601String(),
            'is_active' => $this->is_active,

            /*
             * Derived, and only when the caller asked for them.
             *
             * `whenNotNull` rather than a default: a list that has not loaded
             * the figures should say so by leaving the keys out, not by
             * answering 0% on-time for a butcher who has never been late. A
             * screen can tell "not asked for" from "none yet"; it cannot tell
             * an invented zero from a real one.
             */
            'open_purchase_orders' => $this->whenNotNull(
                $this->attributeIfLoaded('open_purchase_orders_count'),
            ),
            'quarter_spend' => $this->whenNotNull(
                $this->attributeIfLoaded('quarter_spend'),
            ),
            /*
             * A percentage, and `null` for a supplier nothing has arrived from
             * yet. Zero would read as "never on time", which is the opposite of
             * what an empty history means — and it is the first column a buyer
             * sorts by.
             */
            'on_time_percent' => $this->when(
                $this->attributeIfLoaded('deliveries_count') !== null,
                fn (): ?int => $this->onTimePercent(),
            ),

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }

    /** A subquery result, as an integer, or null when it was not selected. */
    private function attributeIfLoaded(string $key): ?int
    {
        $value = $this->resource->getAttribute($key);

        return $value === null ? null : (int) $value;
    }

    private function onTimePercent(): ?int
    {
        $delivered = $this->attributeIfLoaded('deliveries_count') ?? 0;

        if ($delivered === 0) {
            return null;
        }

        return (int) round(($this->attributeIfLoaded('on_time_deliveries_count') ?? 0) * 100 / $delivered);
    }
}
