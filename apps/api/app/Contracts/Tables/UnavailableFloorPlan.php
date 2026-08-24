<?php

declare(strict_types=1);

namespace App\Contracts\Tables;

/**
 * The floor when the Tables module is off: nothing to claim, nothing to answer.
 *
 * `UnavailableFloorBoard` answers zero because "no tables" is a true reading of
 * a fast-food counter. This one answers `false` for the mirror reason: a phone
 * told its claim landed clears that entry from its queue, and the claim then
 * exists nowhere. Refusing keeps the entry, and the batch reports it as one
 * rejection beside the eleven that worked.
 */
final class UnavailableFloorPlan implements FloorPlan
{
    public function claim(int $tableId, int $userId): bool
    {
        return false;
    }

    public function resolveCall(int $callId, int $userId): bool
    {
        return false;
    }

    public function release(int $tableId): bool
    {
        // A counter with no floor plan has no table to clear, and the caller —
        // a bill settling itself — carries on either way: auto-clearing is a
        // convenience, never a step the money depends on.
        return false;
    }
}
