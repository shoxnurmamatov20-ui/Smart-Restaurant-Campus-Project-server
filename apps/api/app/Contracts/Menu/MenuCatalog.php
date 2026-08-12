<?php

declare(strict_types=1);

namespace App\Contracts\Menu;

/**
 * The one way to read the menu from outside the Menu module.
 *
 * Orders needs a dish to snapshot onto a bill; the Telegram WebApp needs the
 * sellable catalogue. Both used to import `Modules\Menu\Models\MenuItem`
 * directly, which meant a change to Menu's schema could break the POS and the
 * bots at once, and neither module could ever be deployed separately.
 *
 * Implemented by Menu, resolved through the container, and always scoped to the
 * current restaurant by the caller's tenant context.
 */
interface MenuCatalog
{
    /** One dish by id, or null if this restaurant has no such dish. */
    public function find(int $id): ?Dish;

    /** One dish by the code printed on the ticket. */
    public function findBySku(string $sku): ?Dish;

    /**
     * Everything a guest can actually order on this channel right now —
     * active sections, no drafts, no archived dishes, nothing on the stop-list.
     *
     * @return array<int, Section>
     */
    public function sellable(string $channel = 'dine_in'): array;
}
