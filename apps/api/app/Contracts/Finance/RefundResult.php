<?php

declare(strict_types=1);

namespace App\Contracts\Finance;

/**
 * What a refund actually did, so the order side can follow it.
 *
 * A refund is two halves that must move together: the money goes back, and the
 * bill stops being a sale. Finance owns the first and Orders owns the second, and
 * neither can see the other — so the half that happens first has to hand over
 * enough for the caller to complete the other in the same transaction. This is
 * that handover.
 *
 * The state in between — money returned, bill still reading `paid` — is the one an
 * audit cannot explain and a guest can walk back in and exploit. It is also the
 * state the system was permanently in before this existed: `TillLedger::refund()`
 * flipped a payment row and nothing ever moved the order.
 *
 * ---------------------------------------------------------------------------
 *
 * Two fields carry the judgements that a caller must not make for itself.
 *
 * **`orderFullyRefunded`** is decided here, from what is left captured against the
 * order, because a partial refund leaves the bill `paid` — it still was. A caller
 * counting its own tenders would get this wrong the first time a table paid with
 * two cards and asked for one of them back.
 *
 * **`cashReturned`** is what physically left the box. It is not the same as
 * `amount`: a card refund returns money to a bank days later and the drawer never
 * opens. A shift's expected cash must move by this and by nothing else.
 */
final readonly class RefundResult
{
    /**
     * @param int $amount Tiyin taken off this payment.
     * @param int $cashReturned Tiyin that left the drawer — zero for anything but cash.
     * @param int $liveTenders How many captured payments the order still has.
     * @param int|null $refundingShiftId The shift that paid it out, which is not
     *                                   necessarily the one that took it: yesterday's takings are
     *                                   refunded from today's drawer, and the Z-report of the shift
     *                                   handing the notes over is the one that has to account for it.
     */
    public function __construct(
        public int $paymentId,
        /**
         * The bill this came off, when there is one.
         *
         * Null is a real state, not a missing value: `payments.order_id` is
         * nullable and always has been, because a payment can be recorded from the
         * console against no bill at all — a deposit, a correction, money taken for
         * something that never became an order. Refunding one of those is ordinary
         * work, and a contract that could not express it forced the implementation
         * to keep a second, wider method beside this one.
         */
        public ?int $orderId,
        public ?string $orderNumber,
        public string $method,
        public int $amount,
        public int $cashReturned,
        public int $liveTenders,
        public bool $orderFullyRefunded,
        public ?int $refundingShiftId,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'payment_id' => $this->paymentId,
            'order_id' => $this->orderId,
            'order_number' => $this->orderNumber,
            'method' => $this->method,
            'amount' => $this->amount,
            'cash_returned' => $this->cashReturned,
            'live_tenders' => $this->liveTenders,
            'order_fully_refunded' => $this->orderFullyRefunded,
            'refunding_shift_id' => $this->refundingShiftId,
        ];
    }
}
