<?php

declare(strict_types=1);

namespace App\Contracts\Inventory;

/**
 * The two ways another module may move stock.
 *
 * Narrow on purpose. Receiving a delivery is Suppliers' job and goes through
 * the purchase order, consumption is the recipe card's, and neither belongs
 * here — what is left is the two things a person does with their hands and a
 * phone: throw something away, and count a shelf.
 *
 * It exists because the staff app's offline queue holds `waste_log` and
 * `count_submit`, and the Staff module may not import Inventory —
 * `ModuleBoundaryTest` records exactly one edge into Inventory, from Suppliers,
 * and adding a second would make the two modules one program. The alternative
 * was to park both kinds in a journal and post them by hand later, which is a
 * write-off nobody sees until the stock-take does not balance.
 *
 * Both methods answer `null` for an ingredient this restaurant does not have,
 * rather than throwing. The caller is a batch: one bad line out of twelve must
 * come back as one rejection with a reason, not as a failed request that leaves
 * the other eleven in the queue forever.
 */
interface StockLedger
{
    /**
     * Take spoilt, dropped or expired stock off the shelf.
     *
     * @param int $quantity base units, always positive — the direction is the method's, not the caller's
     * @param string $reason required, and it is the whole point: unexplained shrinkage is what this module exists to surface
     */
    public function writeOff(int $ingredientId, int $quantity, string $reason, ?string $reference = null): ?StockChange;

    /**
     * Record what was actually on the shelf and post the difference.
     *
     * @param int $counted base units, absolute — what the person counted, not the gap
     */
    public function recordCount(int $ingredientId, int $counted, ?string $reference = null): ?StockChange;
}
