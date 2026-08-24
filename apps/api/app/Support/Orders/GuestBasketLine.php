<?php

declare(strict_types=1);

namespace App\Support\Orders;

use App\Contracts\Menu\Dish;

/**
 * One line of a guest's basket, after the catalogue has vouched for it.
 *
 * Carries the whole `Dish` rather than an id because both callers need the
 * price, the title and the cook time straight afterwards, and looking the same
 * dish up twice is a query per line for data already in hand.
 */
final readonly class GuestBasketLine
{
    /**
     * @param array<int, int> $choiceIds
     */
    public function __construct(
        public Dish $dish,
        public int $quantity,
        public array $choiceIds,
        public ?string $note,
        public int $seatNo = 1,
    ) {}
}
