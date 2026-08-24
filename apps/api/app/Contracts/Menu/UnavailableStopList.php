<?php

declare(strict_types=1);

namespace App\Contracts\Menu;

use Illuminate\Support\Carbon;

/**
 * What callers get when the Menu module is not installed or is switched off.
 *
 * "Nothing is off" is the safe answer for the reads: a POS that greyed out its
 * whole menu because it could not reach the stop-list would be a till that
 * cannot sell, which is worse than one that lets a cook say "we're out of that"
 * across the pass.
 *
 * The writes answer `false` — nothing changed — so a caller does not announce a
 * stop that was never recorded. The kitchen screen shows the dish as still on,
 * which is the truth.
 */
final class UnavailableStopList implements StopList
{
    /**
     * @return array<int, int>
     */
    public function stoppedItemIds(): array
    {
        return [];
    }

    /**
     * @return array<int, StoppedDish>
     */
    public function current(): array
    {
        return [];
    }

    public function stop(int $dishId, ?string $reason = null, ?Carbon $until = null): bool
    {
        return false;
    }

    public function clear(int $dishId): bool
    {
        return false;
    }
}
