<?php

declare(strict_types=1);

namespace App\Contracts\Orders;

use App\Contracts\Menu\Dish;

/**
 * One line on a bill, as the rest of the platform is allowed to see it.
 *
 * Every field is a snapshot taken when the line was rung up. That is not an
 * optimisation — it is the rule that keeps a settled bill true: repricing a dish
 * tomorrow must never change what a guest paid last night, and renaming it must
 * never rewrite the receipt.
 *
 * @see Dish for the same idea on the catalogue side.
 */
final readonly class BillLine
{
    /**
     * @param int $unitPrice Tiyin, never a float. 1 UZS = 100 tiyin.
     * @param int $totalPrice Tiyin. quantity × unitPrice, computed server-side.
     */
    public function __construct(
        public int $id,
        public int $orderId,
        public ?int $menuItemId,
        public string $sku,
        public string $title,
        public ?string $station,
        public int $quantity,
        public int $unitPrice,
        public int $totalPrice,
        public string $status,
        public ?string $note = null,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'order_id' => $this->orderId,
            'menu_item_id' => $this->menuItemId,
            'sku' => $this->sku,
            'title' => $this->title,
            'station' => $this->station,
            'quantity' => $this->quantity,
            'unit_price' => $this->unitPrice,
            'total_price' => $this->totalPrice,
            'status' => $this->status,
            'note' => $this->note,
        ];
    }
}
