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
     * @param int $totalPrice Tiyin. quantity × (unitPrice + modifiers), server-side.
     * @param int $seatNo Which guest ordered it. Never null — see Q4.
     * @param int $billNo Which of the table's bills it goes on, 1-4.
     * @param array<int, LineModifier> $modifiers Frozen at the moment they were chosen.
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
        public int $seatNo = 1,
        public int $billNo = 1,
        public array $modifiers = [],
        /**
         * The fiscal classification code, snapshotted like everything else here.
         *
         * A snapshot and not a join, for this class's own stated rule: a receipt
         * filed last night must keep saying what it said, and a dish
         * reclassified next month must not rewrite it. The authority holds the
         * old declaration; ours has to match it.
         *
         * @see Dish::$plu for what the code is.
         */
        public ?string $plu = null,
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
            'plu' => $this->plu,
            'sku' => $this->sku,
            'title' => $this->title,
            'station' => $this->station,
            'quantity' => $this->quantity,
            'unit_price' => $this->unitPrice,
            'total_price' => $this->totalPrice,
            'status' => $this->status,
            'note' => $this->note,
            'seat_no' => $this->seatNo,
            'bill_no' => $this->billNo,
            'modifiers' => array_map(
                static fn (LineModifier $modifier): array => $modifier->toArray(),
                $this->modifiers,
            ),
        ];
    }
}
