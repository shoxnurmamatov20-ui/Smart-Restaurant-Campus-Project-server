<?php

declare(strict_types=1);

namespace Modules\Tables\Services;

use App\Contracts\Tables\FloorBoard;
use App\Contracts\Tables\FloorSeat;
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

    public function tableIdForToken(string $token): ?int
    {
        /*
         * Through the model's own finder rather than a query written here: it
         * is where "a token comes off a camera pointed at a printed square"
         * already lives, so a peeling sticker and a photograph of a photograph
         * get the same null the QR routes give them.
         *
         * `BelongsToTenant` and the row-level policy scope it twice, so another
         * restaurant's token is not "forbidden" here: from this request it does
         * not exist, which is the only answer that does not turn a review form
         * into a way to enumerate the platform's furniture.
         */
        $table = RestaurantTable::findByQrToken($token);

        return $table === null ? null : (int) $table->getKey();
    }

    /**
     * One waiter's own section, ordered the way it is walked.
     *
     * `claimed_by_user_id` is the whole filter, and it is the reason this can
     * be published at all: the row is only reachable by the person named on it.
     * `FloorPlan::claim()` is what writes it — *"a claim recorded without the
     * person would seat the room and tell nobody whose section it is"* — and
     * this is the read that finally uses it.
     *
     * The hall comes along because a label alone is ambiguous across halls: two
     * venues in the same restaurant both have an A-1, and so do the terrace and
     * the main room. Eager-loaded rather than joined so the hall's own model
     * stays the authority on what a hall is called.
     *
     * Inactive tables are excluded, matching `tally()`: a table taken out of
     * service is not part of anybody's section, however it was left.
     */
    public function section(int $userId, ?int $branchId = null): array
    {
        return RestaurantTable::query()
            ->with('hall:id,name')
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->where('is_active', true)
            ->where('claimed_by_user_id', $userId)
            ->orderBy('label')
            ->get()
            ->map(fn (RestaurantTable $table): FloorSeat => new FloorSeat(
                id: (int) $table->getKey(),
                label: $table->label,
                seats: (int) $table->seats,
                kind: $table->kind,
                zone: $table->hall?->name,
                status: $table->status,
                claimedAt: $table->claimed_at?->toIso8601String(),
            ))
            ->values()
            ->all();
    }
}
