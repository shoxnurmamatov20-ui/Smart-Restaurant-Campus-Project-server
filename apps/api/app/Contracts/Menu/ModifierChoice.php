<?php

declare(strict_types=1);

namespace App\Contracts\Menu;

/**
 * One answer a guest may give about a dish.
 *
 * @param int $priceDelta Tiyin, per unit of the line. May be negative.
 */
final readonly class ModifierChoice
{
    public function __construct(
        public int $id,
        public string $title,
        public int $priceDelta,
    ) {}

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'price_delta_tiyin' => $this->priceDelta,
        ];
    }
}
