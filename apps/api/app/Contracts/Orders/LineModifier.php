<?php

declare(strict_types=1);

namespace App\Contracts\Orders;

/**
 * A modifier as it sits on a line that has already been rung up.
 *
 * Distinct from `App\Contracts\Menu\ModifierChoice`, which is an offer, while
 * this is a record. They carry the same three fields today and will not stay
 * that way: an offer gains "is this still available", a record gains nothing
 * ever, because the whole point of it is that it cannot change.
 *
 * @param int $priceDelta Tiyin, per unit of the line, frozen at ring-up.
 */
final readonly class LineModifier
{
    public function __construct(
        public ?int $optionId,
        public string $title,
        public int $priceDelta,
    ) {}

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'option_id' => $this->optionId,
            'title' => $this->title,
            'price_delta' => $this->priceDelta,
        ];
    }
}
