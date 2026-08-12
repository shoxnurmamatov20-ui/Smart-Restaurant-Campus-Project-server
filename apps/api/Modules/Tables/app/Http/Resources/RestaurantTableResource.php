<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Tables\Models\RestaurantTable;

/**
 * @mixin RestaurantTable
 */
final class RestaurantTableResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'label' => $this->label,
            'seats' => $this->seats,
            'kind' => $this->kind,
            'status' => $this->status,
            'is_active' => $this->is_active,
            'qr_token' => $this->qr_token,
            'hall' => [
                'id' => $this->hall_id,
                'name' => $this->whenLoaded('hall', fn (): string => $this->hall->name),
            ],
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
