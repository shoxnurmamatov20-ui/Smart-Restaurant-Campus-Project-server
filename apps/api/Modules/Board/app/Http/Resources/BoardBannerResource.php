<?php

declare(strict_types=1);

namespace Modules\Board\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Board\Models\BoardBanner;

/**
 * @mixin BoardBanner
 */
final class BoardBannerResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'branch_id' => $this->branch_id,
            'slug' => $this->slug,
            'title' => $this->title,
            'text' => $this->text,
            'kind' => $this->kind,

            'starts_at' => $this->starts_at?->toIso8601String(),
            'ends_at' => $this->ends_at?->toIso8601String(),
            'is_live' => $this->is_live,

            'published_at' => $this->published_at?->toIso8601String(),
            'behind_the_screens' => $this->isBehindTheScreens(),

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
