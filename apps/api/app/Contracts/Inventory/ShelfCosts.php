<?php

declare(strict_types=1);

namespace App\Contracts\Inventory;

/**
 * What a recipe line is made of, and what one unit of it costs.
 *
 * The third read into Inventory, beside `StockLedger` (the write half) and
 * `StockReport` (what is on the shelves). This one is narrower than either: it
 * answers "name, unit, cost per base unit" for a set of ids and nothing else —
 * no balances, no expiry, no ability to move anything.
 *
 * The caller is Menu. A dish's technical card is the join between
 * `menu.menu_items` and the shelf, and `ModuleBoundaryTest` records no edge
 * from Menu into Inventory — nor should it: a menu that imported the warehouse
 * could not be read without it, and the QR menu is the most-hit endpoint on the
 * platform. So the lines live in `menu.recipe_lines` carrying bare ids, and the
 * words and the money come through here.
 *
 * **Ids that do not resolve are simply absent from the answer.** Not an
 * exception and not a zero-cost placeholder: an ingredient deleted after a card
 * was written is a card with a hole in it, and the card has to be able to say
 * so — a line silently costed at nothing is how a dish reports a margin it does
 * not have.
 */
interface ShelfCosts
{
    /**
     * @param list<int> $ids
     *
     * @return array<int, ShelfComponent> keyed by ingredient id; missing ids are absent
     */
    public function ingredients(array $ids): array;

    /**
     * @param list<int> $ids
     *
     * @return array<int, ShelfComponent> keyed by prep item id; missing ids are absent
     */
    public function prepItems(array $ids): array;
}
