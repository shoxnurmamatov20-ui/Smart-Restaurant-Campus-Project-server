<?php

declare(strict_types=1);

namespace App\Contracts\Orders;

use App\Support\Orders\OrderState;

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
     * @param  int  $subtotal  Tiyin — the lines, before adjustments.
     * @param  int  $discountTotal  Tiyin — always positive; it is subtracted.
     * @param  int  $serviceCharge  Tiyin.
     * @param  int  $total  Tiyin — what the guest owes.
     * @param  array<int, BillLine>  $lines
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
        /** Tax already inside `total`, not added to it. See BillTotals. */
        public int $vatIncluded = 0,
        /** Tiyin, outside the VAT base. */
        public int $deliveryFee = 0,
        public array $lines = [],
        public ?string $note = null,
    ) {}

    /**
     * Open bills can still be changed; closed ones never can.
     *
     * Asked of the ladder rather than of a list written here, and the list is why.
     * It read `['paid', 'cancelled']` — and `cancelled` is not a state this platform
     * has. `OrderState` names four terminal ones: `paid`, `voided`, `refunded`,
     * `comped`. So a voided bill answered `is_open: true`, the till drew it as
     * live, and `TenderService` — which reads exactly this flag — would take money
     * for it and then fail inside `close()` with a sentence about the bill that
     * explained nothing.
     *
     * A hand-maintained copy of a ladder is a copy that goes stale the first time
     * the ladder grows, silently, in the direction of "still open". Two of the three
     * states it missed were added by the very change that introduced the ladder.
     */
    public function isOpen(): bool
    {
        return OrderState::tryFrom($this->status)?->isOpen()
            // A status the ladder does not know is not open. Erring closed keeps a
            // bill from being sold twice while somebody works out what it is;
            // erring open would take a guest's money for it.
            ?? false;
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
            'delivery_fee' => $this->deliveryFee,
            // Named for what it is, so a client cannot render it as "+ VAT".
            'vat_included' => $this->vatIncluded,
            'total' => $this->total,
            'note' => $this->note,
            'lines' => array_map(static fn (BillLine $line): array => $line->toArray(), $this->lines),
        ];
    }
}
