<?php

declare(strict_types=1);

namespace Modules\Board\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Board\Models\BoardScreen;

/**
 * @mixin BoardScreen
 */
final class BoardScreenResource extends JsonResource
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
            'name' => $this->name,

            'seconds' => $this->seconds,
            /*
             * `HH:MM`, trimmed from PostgreSQL's `HH:MM:SS`.
             *
             * A board window is set to the minute — no counter opens breakfast
             * at 08:00:30 — and the seconds would travel to a console that has
             * to strip them anyway, in one more place that can forget to.
             */
            'window_start' => $this->clock($this->window_start),
            'window_end' => $this->clock($this->window_end),
            // The console draws two different rows for these, so it is told
            // which rather than inferring it from a null.
            'is_scheduled' => $this->is_scheduled,

            'is_active' => $this->is_active,
            'position' => $this->position,

            'published_at' => $this->published_at?->toIso8601String(),
            'behind_the_screens' => $this->isBehindTheScreens(),

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }

    private function clock(?string $time): ?string
    {
        return $time === null ? null : substr($time, 0, 5);
    }
}
