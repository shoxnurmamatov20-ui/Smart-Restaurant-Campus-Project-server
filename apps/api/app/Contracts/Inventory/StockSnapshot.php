<?php

declare(strict_types=1);

namespace App\Contracts\Inventory;

/**
 * What is on the shelves, as four counts and a value.
 *
 * The storekeeper's dashboard draws exactly this: a donut of four states and a
 * figure under it. Counts of SKUs, not quantities — "128 lines in stock" is the
 * sentence, and summing kilograms with litres and pieces would produce a number
 * that means nothing.
 *
 * The four are exclusive and they add up to the catalogue: an ingredient is
 * `out`, or `low`, or `expiring`, or `ok`, in that order of urgency. Something
 * that is both low AND expiring is counted once, as `low`, because a storekeeper
 * ordering more of it solves both — and a donut whose slices overlap is a donut
 * whose total is wrong.
 */
final readonly class StockSnapshot
{
    public function __construct(
        public int $ok,
        public int $low,
        public int $out,
        public int $expiring,
        /** What the shelf is worth, in tiyin: quantity × cost per base unit. */
        public int $valueTiyin,
    ) {}
}
