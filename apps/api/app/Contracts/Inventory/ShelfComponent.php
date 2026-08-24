<?php

declare(strict_types=1);

namespace App\Contracts\Inventory;

/**
 * One thing a recipe card can be made of, priced.
 *
 * Raw goods and prep both arrive in this shape because a technical card treats
 * them identically — two hundred grams of rice and two hundred and sixty grams
 * of zirvak are both "a quantity of something with a cost per base unit" — and
 * a caller that had to branch on which it was holding would branch in four
 * places and get one of them wrong.
 *
 * `costPerUnitTiyin` is per ONE base unit (a gram, a millilitre, a piece), and
 * for prep it is the cost per USABLE unit, after loss. That distinction is the
 * whole reason prep exists as a table: eight litres of stock simmered down to
 * six and a half still cost what eight litres of beef and onion cost, and a
 * dish costed against the batch rather than the yield is a dish quietly
 * underpriced.
 */
final readonly class ShelfComponent
{
    public function __construct(
        public int $id,
        /** What a cook calls it. Raw goods carry one name; prep is trilingual and arrives resolved. */
        public string $name,
        /** g | ml | pcs — the base unit the quantity on the recipe line is counted in. */
        public string $unit,
        public int $costPerUnitTiyin,
    ) {}
}
