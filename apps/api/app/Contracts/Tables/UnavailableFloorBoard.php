<?php

declare(strict_types=1);

namespace App\Contracts\Tables;

/**
 * The floor when the Tables module is off: empty, not broken.
 *
 * A fast-food counter runs the POS with no floor plan at all, so "zero tables"
 * is a true answer there — and the idle screen simply hides the pair.
 */
final class UnavailableFloorBoard implements FloorBoard
{
    public function tally(?int $branchId = null): FloorTally
    {
        return new FloorTally(occupied: 0, free: 0);
    }

    /**
     * No floor plan, no tables, no stickers.
     *
     * Null rather than a refusal, matching `tally()`'s zeroes: a venue with no
     * Tables module is a counter, and a review left there is a review about the
     * counter. Losing the comment because there is no furniture to attach it to
     * would be losing the thing that was worth having.
     */
    public function tableIdForToken(string $token): ?int
    {
        return null;
    }

    /**
     * A counter has no sections, so nobody holds anything.
     *
     * Empty rather than a refusal, matching the two above: the waiter's home
     * screen draws "no tables yet", which is exactly true of a venue with no
     * floor plan.
     */
    public function section(int $userId, ?int $branchId = null): array
    {
        return [];
    }
}
