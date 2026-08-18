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
}
