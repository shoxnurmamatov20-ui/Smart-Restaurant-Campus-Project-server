<?php

declare(strict_types=1);

namespace Modules\Board\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Board\Models\BoardColumn;

/**
 * @mixin BoardColumn
 */
final class BoardColumnResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'branch_id' => $this->branch_id,
            'menu_category_id' => $this->menu_category_id,
            'accent' => $this->accent,
            'position' => $this->position,
            'is_visible' => $this->is_visible,

            'published_at' => $this->published_at?->toIso8601String(),
            // Whether the wall is behind this row. The console draws it as
            // "unpublished changes" next to the push button; without it a
            // manager has to remember whether they pressed it.
            'behind_the_screens' => $this->isBehindTheScreens(),

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
