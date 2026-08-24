<?php

declare(strict_types=1);

namespace App\Contracts\Inventory;

/**
 * What one movement did to one shelf.
 *
 * Returned rather than "true": the caller is usually a queue drain reporting
 * back to a phone that has been offline, and "it worked" is not enough for the
 * storekeeper holding it. The balance is what their screen has to show next,
 * and the delta is what they can check against what they actually threw away.
 */
final readonly class StockChange
{
    public function __construct(
        public int $ingredientId,
        /** Signed, in base units: negative took stock off the shelf. */
        public int $delta,
        /** What is on the shelf after this movement, in base units. */
        public int $balance,
    ) {}
}
