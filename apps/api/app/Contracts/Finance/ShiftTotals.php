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
        ];
    }
}
