<?php

declare(strict_types=1);

namespace App\Contracts\Menu;

use Illuminate\Support\Carbon;

/**
 * One line of the 86 sheet, as anything outside Menu sees it.
 *
 * A snapshot, like every other DTO in App\Contracts: readonly, no model behind
 * it, nothing a caller can lazily load a relation off. The station is on it
 * because the sheet is read by station — a grill cook takes grill dishes off —
 * and resolving it caller-side would mean the whole catalogue again.
 */
final readonly class StoppedDish
{
    public function __construct(
        public int $dishId,
        public string $title,
        public string $station,
        /** Who took it off, by name. Null for an automatic stop. */
        public ?string $stoppedBy,
        public ?string $reason,
        public ?Carbon $until,
        public Carbon $since,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'dish_id' => $this->dishId,
            'title' => $this->title,
            'station' => $this->station,
            'stopped_by' => $this->stoppedBy,
            'reason' => $this->reason,
            'until' => $this->until?->toIso8601String(),
            'since' => $this->since->toIso8601String(),
        ];
    }
}
