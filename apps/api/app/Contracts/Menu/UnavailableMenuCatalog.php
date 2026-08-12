<?php

declare(strict_types=1);

namespace App\Contracts\Menu;

/**
 * What callers get when the Menu module is not installed or is switched off.
 *
 * A contract with no implementation would blow up in the container the moment a
 * waiter tried to add a dish. Answering "no such dish" instead turns a fatal
 * into a 422 the POS can show, and keeps every other module bootable without
 * Menu — which is the point of having the contract at all.
 */
final class UnavailableMenuCatalog implements MenuCatalog
{
    public function find(int $id): ?Dish
    {
        return null;
    }

    public function findBySku(string $sku): ?Dish
    {
        return null;
    }

    /**
     * @return array<int, Section>
     */
    public function sellable(string $channel = 'dine_in'): array
    {
        return [];
    }
}
