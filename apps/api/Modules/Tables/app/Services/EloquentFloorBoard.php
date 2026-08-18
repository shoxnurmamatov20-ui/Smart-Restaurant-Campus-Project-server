<?php

declare(strict_types=1);

namespace Modules\Tables\Services;

use App\Contracts\Tables\FloorBoard;
use App\Contracts\Tables\FloorTally;
use Modules\Tables\Models\RestaurantTable;

/**
 * The floor plan answering the one question other modules may ask it.
 *
 * `occupied` folds `reserved` in — a reserved table cannot be given away, so
 * from the doorway it is taken. `cleaning` lands in neither bucket, which is
 * why the tally is two counts and not one subtraction.
 */
final class EloquentFloorBoard implements FloorBoard
{
    public function tally(?int $branchId = null): FloorTally
    {
        $counts = RestaurantTable::query()
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->where('is_active', true)
            ->toBase()
            ->selectRaw("count(*) filter (where status in ('occupied', 'reserved')) as occupied")
            ->selectRaw("count(*) filter (where status = 'free') as free")
            ->first();

        return new FloorTally(
            occupied: (int) ($counts->occupied ?? 0),
            free: (int) ($counts->free ?? 0),
        );
    }
}
