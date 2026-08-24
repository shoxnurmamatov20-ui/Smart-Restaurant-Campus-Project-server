<?php

declare(strict_types=1);

namespace App\Contracts\Inventory;

/**
 * What the rest of the platform may ask about the shelf, read-only.
 *
 * `StockLedger` is the write half — a phone throwing something away, a phone
 * counting a shelf — and this is the read half. They are two interfaces rather
 * than one because they have opposite blast radii: a caller that may take stock
 * off a shelf is a caller that can lose a kitchen's ingredients, and most
 * readers of "how much beef is left" should never be handed that.
 *
 * The caller is Analytics. The storekeeper's dashboard and the owner's
 * "diqqat" panel both need what is running out, and `ModuleBoundaryTest` lists
 * exactly three allowed edges out of Analytics — Menu, Orders and Finance — so
 * reading `inventory.ingredients` directly is a boundary crossing. It is also
 * the read that made `SalesInsights::summary()` answer `labour_cost_percent`
 * as null with a paragraph about why: an aggregate a module may not compute is
 * an aggregate that must arrive through a contract or not at all.
 *
 * Nothing here is per branch. `inventory.ingredients` carries no `branch_id` —
 * a restaurant's catalogue is the business's, like the menu — so a branch
 * parameter would be a lie the signature told.
 */
interface StockReport
{
    /** The four states and what the shelf is worth. */
    public function snapshot(): StockSnapshot;

    /**
     * What the kitchen ate, biggest first.
     *
     * Dates as `Y-m-d`, inclusive at both ends, read against the movement's own
     * `happened_at`. Consumption only — a write-off is waste and is asked for
     * separately, because putting the two in one figure is how a food-cost
     * number quietly absorbs a freezer that failed.
     *
     * @return array<int, ConsumedLine>
     */
    public function consumedBetween(string $from, string $to, int $limit = 5): array;

    /**
     * What was thrown away, in tiyin, over the same kind of window.
     *
     * Its own method rather than a fifth field on the snapshot: waste is about
     * a PERIOD and the snapshot is about a moment, and a shape that mixed the
     * two would be read as "we are currently wasting 1.8%".
     */
    public function wasteValueBetween(string $from, string $to): int;
}
