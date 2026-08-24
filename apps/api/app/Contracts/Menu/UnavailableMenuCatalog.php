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

    /**
     * @return array<int, Section>
     */
    public function board(string $channel = 'dine_in'): array
    {
        return [];
    }

    /**
     * @return array<int, ModifierQuestion>
     */
    public function questionsFor(int $dishId): array
    {
        return [];
    }

    public function prepMinutes(int $dishId): int
    {
        /*
         * A read, so it answers rather than throws — same rule as the reads
         * above. The configured default is the honest answer: with no catalogue
         * there is no dish to be faster or slower than the house average, and a
         * zero would tell a guest their food is already ready.
         */
        return (int) config('menu.default_prep_minutes', 15);
    }

    /**
     * @param  array<int, int>  $choiceIds
     * @return array<int, ModifierChoice>
     */
    public function priceChoices(int $dishId, array $choiceIds): array
    {
        // Refuses rather than returning nothing, and the asymmetry with the
        // reads above is the point: answering "no such dish" to a read turns a
        // fatal into a 422 the client can show, while silently pricing a set of
        // modifiers at zero would put food on a ticket that nobody was charged
        // for. A read may be empty; a price may not be invented.
        if ($choiceIds !== []) {
            throw new \RuntimeException('Menyu moduli yoqilmagan — qo\'shimchalarni narxlab bo\'lmaydi.');
        }

        return [];
    }
}
