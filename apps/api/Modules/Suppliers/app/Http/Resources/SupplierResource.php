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
            // What they sell and how long they take: the two the supplier
            // screen filters and sorts on. See the migration for why neither
            // could be derived from the orders.
            'category' => $this->category,
            'contact_name' => $this->contact_name,
            'phone' => $this->phone,
            'email' => $this->email,
            'payment_terms_days' => $this->payment_terms_days,
            'lead_time_days' => $this->lead_time_days,
            'rating' => $this->rating,
            'debt' => $this->debt,
            'is_active' => $this->is_active,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
