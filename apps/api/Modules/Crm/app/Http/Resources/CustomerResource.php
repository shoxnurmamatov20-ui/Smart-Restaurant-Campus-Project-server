<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Crm\Models\Customer;

/**
 * @mixin Customer
 */
final class CustomerResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'phone' => $this->phone,
            'name' => $this->name,
            'birthday' => $this->birthday?->toDateString(),
            'birthday_is_today' => $this->birthday_is_today,
            'points' => $this->points,
            'tier' => $this->tier,
            'cashback' => $this->cashback,
            'visits_count' => $this->visits_count,
            'total_spent' => $this->total_spent,
            'average_cheque' => $this->average_cheque,
            'allergens' => $this->allergens ?? [],
            'note' => $this->note,
            'is_active' => $this->is_active,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
