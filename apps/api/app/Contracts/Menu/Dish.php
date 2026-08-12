<?php

declare(strict_types=1);

namespace App\Contracts\Menu;

/**
 * A dish, as the rest of the platform is allowed to see it.
 *
 * Everything another module legitimately needs — what it is called, what it
 * costs, which station cooks it, whether it can be sold right now — and nothing
 * about how Menu stores any of that. A module holding one of these keeps
 * working when Menu changes a column, splits a table, or moves to its own
 * service.
 */
final readonly class Dish
{
    /**
     * @param int $price Tiyin, never a float. 1 UZS = 100 tiyin.
     * @param array<int, string> $allergens
     */
    public function __construct(
        public int $id,
        public string $sku,
        public string $title,
        public ?string $description,
        public ?string $station,
        public int $price,
        public string $currency,
        public bool $isOrderable,
        public ?int $cookTimeMinutes,
        public array $allergens,
        public string $kind,
        public ?string $imageUrl = null,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'sku' => $this->sku,
            'title' => $this->title,
            'description' => $this->description,
            'station' => $this->station,
            'price_tiyin' => $this->price,
            'currency' => $this->currency,
            'is_orderable' => $this->isOrderable,
            'cook_time_minutes' => $this->cookTimeMinutes,
            'allergens' => $this->allergens,
            'kind' => $this->kind,
            'image_url' => $this->imageUrl,
        ];
    }
}
