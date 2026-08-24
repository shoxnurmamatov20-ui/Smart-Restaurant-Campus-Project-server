<?php

declare(strict_types=1);

namespace App\Contracts\Finance;

/**
 * What a cash shift came to.
 *
 * `expectedCash` is derived by Finance from what was actually taken and paid
 * out; `countedCash` is what a human found in the drawer. The difference between
 * them is the only number a manager really reads, and it is meaningless unless
 * the first one was computed server-side — which is why nothing here can be set
 * by a client.
 */
final readonly class ShiftTotals
{
    /**
     * @param array<string, int> $byMethod Tiyin taken per payment method.
     */
    public function __construct(
        public int $shiftId,
        public string $status,
        public int $openingCash,
        public int $cashTaken,
        public int $cashPaidOut,
        public int $expectedCash,
        public ?int $countedCash,
        public ?int $difference,
        public int $totalTakings,
        public int $refunded,
        public int $paymentCount,
        public array $byMethod = [],
        /**
         * Tips taken, DECISIONS Q6.
         *
         * Not part of `totalTakings` and not part of revenue — the restaurant did
         * not sell anything for it. It IS in the drawer, so `expectedCash` counts
         * the cash share of it; a shift that left tips out of the expected figure
         * would report a surplus every night and train a manager to ignore the
         * one number that matters.
         */
        public int $tips = 0,
        /**
         * What cash rounding added or removed across the shift, DECISIONS Q7.
         *
         * Signed. Part of `expectedCash` by construction, and reported separately
         * so a difference of a few thousand so'm has a name rather than looking
         * like a cashier who cannot count.
         */
        public int $rounding = 0,
        /**
         * What the acquirers keep.
         *
         * Never touches the drawer and never reduces takings — the guest paid the
         * full amount and the bank deducts later. It is here so an owner can read
         * net card revenue without doing the percentages by hand against a bank
         * statement.
         */
        public int $fees = 0,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'shift_id' => $this->shiftId,
            'status' => $this->status,
            'opening_cash' => $this->openingCash,
            'cash_taken' => $this->cashTaken,
            'cash_paid_out' => $this->cashPaidOut,
            'expected_cash' => $this->expectedCash,
            'counted_cash' => $this->countedCash,
            'difference' => $this->difference,
            'total_takings' => $this->totalTakings,
            'refunded' => $this->refunded,
            'payment_count' => $this->paymentCount,
            'by_method' => $this->byMethod,
            'tips' => $this->tips,
            'rounding' => $this->rounding,
            'fees' => $this->fees,
        ];
    }
}
