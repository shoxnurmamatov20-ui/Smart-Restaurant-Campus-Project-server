<?php

declare(strict_types=1);

namespace Modules\Tables\Services;

use App\Contracts\Tables\FloorPlan;
use Illuminate\Support\Facades\DB;
use Modules\Tables\Models\RestaurantTable;
use Modules\Tables\Models\WaiterCall;

/**
 * Tables answering the platform's two write verbs for the floor.
 *
 * The caller is the staff app's offline queue and nothing else today, which is
 * what shapes both methods: every read is scoped by the tenant's global scope
 * (a claim for a table in another restaurant is a `false`, not a 404 the phone
 * would keep retrying), every write is locked, and neither throws.
 *
 * `lockForUpdate` on both. A phone that queued a claim and then reconnected on
 * a lift's worth of signal sends it twice within milliseconds, and two
 * unlocked reads both see "unclaimed" before either writes — which is the one
 * case the boolean exists to get right.
 */
final class EloquentFloorPlan implements FloorPlan
{
    public function claim(int $tableId, int $userId): bool
    {
        return DB::transaction(function () use ($tableId, $userId): bool {
            /** @var RestaurantTable|null $table */
            $table = RestaurantTable::query()->lockForUpdate()->find($tableId);

            // Inactive tables are refused rather than claimed: a table taken
            // out of service is furniture in a store room, and seating it would
            // put a section on a floor map that has no chairs.
            if ($table === null || ! $table->is_active) {
                return false;
            }

            return $table->claimBy($userId);
        });
    }

    public function release(int $tableId): bool
    {
        return DB::transaction(function () use ($tableId): bool {
            /** @var RestaurantTable|null $table */
            $table = RestaurantTable::query()->lockForUpdate()->find($tableId);

            // Only a table that is actually holding guests. `reserved` is left
            // alone on purpose — see the contract — and `free`/`cleaning`
            // answer false because nothing changed, which is what the boolean
            // means everywhere else on this interface.
            if ($table === null || $table->status !== 'occupied') {
                return false;
            }

            // `markFree()` would also drop the claim, and that is the wrong
            // clearing: the section is still that waiter's until somebody
            // hands the table back. `release()` moves it to `cleaning` and
            // leaves the claim where it is.
            return $table->release();
        });
    }

    public function resolveCall(int $callId, int $userId): bool
    {
        return DB::transaction(function () use ($callId, $userId): bool {
            /** @var WaiterCall|null $call */
            $call = WaiterCall::query()->lockForUpdate()->find($callId);

            if ($call === null || ! in_array($call->status, WaiterCall::LIVE_STATUSES, true)) {
                return false;
            }

            $now = now();

            $call->forceFill([
                'status' => 'done',
                /*
                 * Whoever gets there first owns the acknowledgement.
                 *
                 * A call that was already acknowledged keeps its first name and
                 * its first timestamp: the number this table exists to produce
                 * is how long the guest waited before somebody said "coming",
                 * and overwriting it on the close would report zero every time.
                 */
                'acknowledged_by_user_id' => $call->acknowledged_by_user_id ?? $userId,
                'acknowledged_at' => $call->acknowledged_at ?? $now,
                'closed_at' => $now,
            ])->save();

            return true;
        });
    }
}
