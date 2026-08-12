<?php

declare(strict_types=1);

namespace App\Contracts\Menu;

/**
 * One heading on the menu, with the dishes currently sellable under it.
 */
final readonly class Section
{
    /**
     * @param array<int, Dish> $dishes
     */
    public function __construct(
        public int $id,
        public string $slug,
        public string $title,
        public array $dishes,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'slug' => $this->slug,
            'title' => $this->title,
            'items' => array_map(static fn (Dish $dish): array => $dish->toArray(), $this->dishes),
        ];
    }
}
