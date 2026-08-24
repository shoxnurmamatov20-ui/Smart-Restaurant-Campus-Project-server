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
        /**
         * Off in this kitchen tonight.
         *
         * Separate from `isOrderable`, which is the business's answer — a dish
         * withdrawn from the menu, a draft, one archived. This is one kitchen
         * saying "we're out", and the two are different sentences to a waiter:
         * the first means the dish is gone, the second means ask again tomorrow.
         *
         * Always false on anything `sellable()` returns; only `board()` sets it,
         * because only a till draws a dish it cannot sell.
         */
        public bool $isStopped = false,
        /**
         * The national classification code for the fiscal receipt — IKPU here.
         *
         * Not the SKU, and the two are never interchangeable. A SKU is the
         * restaurant's own word for a dish and it can be anything; a PLU is the
         * tax authority's word for a KIND of goods, shared across every business
         * in the country, and a receipt filed with the wrong one is a receipt
         * filed against somebody else's tax category.
         *
         * Null is legal and common. Most of what is on a menu has never been
         * classified, the fiscal drivers that take a total-only declaration do
         * not ask, and a dish held back from sale because nobody had typed a
         * twelve-digit code is a dish that does not get sold.
         */
        public ?string $plu = null,
        /**
         * The photograph at every size the platform keeps — the shape
         * `App\Support\Media\ImageSet::toArray()` answers — or null when the
         * platform holds none. `imageUrl` stays beside it for readers that
         * want one address; a till that draws a 48px tile reads
         * `image.sizes.thumb` and pays for 5 KB instead of 120.
         *
         * @var array{src: string, width: int, height: int, placeholder: string|null, sizes: array<string, array{url: string, width: int, height: int}>}|null
         */
        public ?array $image = null,
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
            'image' => $this->image,
            'is_stopped' => $this->isStopped,
            'plu' => $this->plu,
        ];
    }
}
