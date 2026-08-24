<?php

declare(strict_types=1);

namespace App\Contracts\Menu;

use Illuminate\Support\Carbon;

/**
 * 86.
 *
 * The one way to read or change a kitchen's stop-list from outside the Menu
 * module — and it is the Kitchen module that changes it, from the wall screen,
 * which is exactly the import `ModuleBoundaryTest` refuses. The POS reads it to
 * grey out a tile; Orders reads it to refuse a line.
 *
 * Everything here is scoped to the current branch by the caller's context, in
 * the same way `MenuCatalog` is scoped to the current restaurant. A stop-list is
 * a fact about one kitchen and there is no sensible tenant-wide answer to
 * "what is off" — `menu_items.is_available` is the question with that shape.
 */
interface StopList
{
    /**
     * The dish ids that are off in this kitchen right now.
     *
     * Ids rather than dishes: every caller already has the menu in hand and
     * wants to mark it up, and returning dishes would mean a second copy of the
     * catalogue going over the wire for the four things that are off.
     *
     * @return array<int, int>
     */
    public function stoppedItemIds(): array;

    /**
     * Everything a chef needs to run the 86 sheet: what is off, since when, who
     * did it and why.
     *
     * @return array<int, StoppedDish>
     */
    public function current(): array;

    /**
     * Take a dish off the menu in this kitchen.
     *
     * Idempotent: stopping something already stopped updates the reason and the
     * expiry rather than opening a second row, because two cooks tapping the same
     * dish on two screens within a second of each other is the normal case.
     *
     * @param Carbon|null $until when it comes back on its own
     *
     * @return bool whether this changed anything — false means it was already off
     *              on the same terms, and a caller should not broadcast
     */
    public function stop(int $dishId, ?string $reason = null, ?Carbon $until = null): bool;

    /**
     * Put it back.
     *
     * @return bool false when it was not off, so nothing is announced
     */
    public function clear(int $dishId): bool;
}
