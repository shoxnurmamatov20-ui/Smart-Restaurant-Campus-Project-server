<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Tables\Models\Hall;

/**
 * @mixin Hall
 */
final class HallResource extends JsonResource
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
            'capacity' => $this->capacity,
            'sort_order' => $this->sort_order,
            'is_active' => $this->is_active,
            'tables_count' => $this->whenCounted('tables'),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
