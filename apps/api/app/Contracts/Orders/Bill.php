<?php

declare(strict_types=1);

namespace App\Contracts\Orders;

/**
 * A bill, as the till sees it.
 *
 * Everything the POS legitimately needs to draw a screen and take money —
 * what is on it, what it comes to, whether it is still open — and nothing about
 * how Orders stores any of that. A module holding one of these keeps working
 * when Orders splits a table or moves to its own service.
 */
final readonly class Bill
{
    /**
     * @param int $subtotal Tiyin — the lines, before adjustments.
     * @param int $discountTotal Tiyin — always positive; it is subtracted.
     * @param int $serviceCharge Tiyin.
     * @param int $total Tiyin — what the guest owes.
     * @param array<int, BillLine> $lines
     */
    public function __construct(
        public int $id,
        public string $number,
        public string $channel,
        public string $status,
        public ?int $tableId,
        public ?string $tableLabel,
        public ?int $waiterUserId,
        public ?int $customerId,
        public int $guestsCount,
        public int $subtotal,
        public int $discountTotal,
        public int $serviceCharge,
        public int $total,
        public array $lines = [],
        public ?string $note = null,
    ) {}

    /** Open bills can still be changed; closed ones never can. */
    public function isOpen(): bool
    {
        return ! in_array($this->status, ['paid', 'cancelled'], true);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'channel' => $this->channel,
            'status' => $this->status,
            'is_open' => $this->isOpen(),
            'table_id' => $this->tableId,
            'table_label' => $this->tableLabel,
            'waiter_user_id' => $this->waiterUserId,
            'customer_id' => $this->customerId,
            'guests_count' => $this->guestsCount,
            'subtotal' => $this->subtotal,
            'discount_total' => $this->discountTotal,
            'service_charge' => $this->serviceCharge,
            'total' => $this->total,
            'note' => $this->note,
            'lines' => array_map(static fn (BillLine $line): array => $line->toArray(), $this->lines),
        ];
    }
}
