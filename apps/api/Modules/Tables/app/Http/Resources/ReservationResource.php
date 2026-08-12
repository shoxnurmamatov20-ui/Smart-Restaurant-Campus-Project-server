<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Tables\Models\Reservation;

/**
 * @mixin Reservation
 */
final class ReservationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'guest_name' => $this->guest_name,
            'guest_phone' => $this->guest_phone,
            'guests_count' => $this->guests_count,
            'starts_at' => $this->starts_at?->toIso8601String(),
            'ends_at' => $this->ends_at?->toIso8601String(),
            'status' => $this->status,
            'source' => $this->source,
            'note' => $this->note,
            'is_upcoming' => $this->is_upcoming,
            'table' => [
                'id' => $this->restaurant_table_id,
                'label' => $this->whenLoaded('restaurantTable', fn (): ?string => $this->restaurantTable?->label),
            ],
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
