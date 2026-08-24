<?php

declare(strict_types=1);

namespace App\Contracts\Inventory;

/**
 * The answer when the Inventory module is switched off.
 *
 * Empty rather than throwing, and the consequence is stated on the contract: a
 * component that does not resolve is absent, so a recipe card read on a
 * restaurant with no warehouse module draws its lines with no cost against them
 * and reports no total. That is the honest outcome — the alternative is a
 * technical card claiming a 100% margin because nothing on it cost anything,
 * which is a number an owner would price against.
 */
final class UnavailableShelfCosts implements ShelfCosts
{
    /**
     * @param list<int> $ids
     *
     * @return array<int, ShelfComponent>
     */
    public function ingredients(array $ids): array
    {
        return [];
    }

    /**
     * @param list<int> $ids
     *
     * @return array<int, ShelfComponent>
     */
    public function prepItems(array $ids): array
    {
        return [];
    }
}
