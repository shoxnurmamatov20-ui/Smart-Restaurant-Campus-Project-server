<?php

declare(strict_types=1);

namespace App\Contracts\Kitchen;

/**
 * What the rest of the platform may ask the kitchen.
 *
 * The console's status strip says "7 dockets in the kitchen · the longest 11
 * minutes" over every screen, and the owner's phone says the same line —
 * neither belongs to the Kitchen module, and modules do not import each
 * other. This is the read they share; `TicketWriter` is the write.
 */
interface KitchenLoad
{
    /** Null branch means the whole restaurant, matching BelongsToBranch. */
    public function pressure(?int $branchId = null): KitchenPressure;

    /**
     * How fast each section of the line is running over a stretch of trading.
     *
     * The manager's dashboard draws a bar per station against its target, and
     * that panel was empty on every live tenant: Analytics may read Menu,
     * Orders and Finance and nothing else (`ModuleBoundaryTest` records the
     * three edges), so "how long is the grill taking" had no way of leaving
     * this module. It is the same argument `pressure()` makes, one level finer.
     *
     * Still not a list of dockets. A caller that wants the tickets is running a
     * kitchen and belongs behind `/api/v1/kitchen` with its permission checks;
     * what leaves here is one row per section, which is what a wall chart shows
     * anyone standing in the pass.
     *
     * `$from` and `$to` are trading dates (`Y-m-d`), inclusive, because that is
     * what every window in this platform is measured in. A docket carries no
     * `business_date` of its own — the KDS is a live board and its rows are
     * cleared nightly — so the implementation reads them as wall-clock days,
     * and the difference is the tail of one night's service either side of the
     * window. Named here rather than hidden, because a caller comparing this
     * against a sales report needs to know the two are not cut identically.
     *
     * @return list<StationSpeed> one row per station that exists, in the
     *                            module's own order; empty when none do
     */
    public function stations(string $from, string $to, ?int $branchId = null): array;
}
