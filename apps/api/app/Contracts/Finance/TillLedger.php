<?php

declare(strict_types=1);

namespace App\Contracts\Finance;

use RuntimeException;

/**
 * The one way to move money from outside the Finance module.
 *
 * The POS opens a shift, captures tenders, pays cash out of the drawer and
 * closes with a count — but it never owns any of that. Finance does, because
 * "what was taken today" has to have exactly one answer, and a second table of
 * payments living in the till would guarantee two.
 *
 * Every amount is an integer in tiyin. `expectedCash` is never accepted from a
 * caller: the whole purpose of counting a drawer is to compare it against what
 * the system believes should be in it, and a client that could send both numbers
 * could make the difference zero.
 */
interface TillLedger
{
    /**
     * Open a cash shift with a starting float.
     *
     * @return int The cash shift id.
     *
     * @throws RuntimeException when this user already has an open shift
     */
    public function openShift(int $userId, int $openingCash = 0): int;

    /** The shift this user currently has open, if any. */
    public function openShiftFor(int $userId): ?int;

    /**
     * Close the shift against a counted drawer and return the Z-report figures.
     *
     * @param int $countedCash What a human found in the drawer, in tiyin.
     *
     * @throws RuntimeException when the shift is unknown or already closed
     */
    public function closeShift(int $shiftId, int $countedCash, ?string $note = null): ShiftTotals;

    /**
     * Record money actually taken for a bill.
     *
     * @return int The payment id.
     *
     * @throws RuntimeException when the shift is closed or the method is unknown
     */
    public function capture(int $shiftId, int $orderId, string $orderNumber, Tender $tender): int;

    /**
     * Reverse a payment. The row survives — a refund is an event, not an
     * eraser.
     *
     * @throws RuntimeException when the payment is unknown
     */
    public function refund(int $paymentId, string $reason): bool;

    /**
     * Money leaving the drawer that is not a refund: a collection, a supplier
     * paid in cash, a tip-out.
     *
     * Recording it here rather than in the till is what keeps the Z-report
     * honest — the expected-cash calculation already subtracts cash paid out,
     * so a collection stops looking like a shortfall without anyone touching
     * that arithmetic.
     *
     * @return int The expense id.
     */
    public function recordCashOut(int $shiftId, int $amount, string $description): int;

    /**
     * X-report: the same figures as a close, without closing anything.
     *
     * @throws RuntimeException when the shift is unknown
     */
    public function shiftTotals(int $shiftId): ShiftTotals;

    /**
     * Payment methods this restaurant can accept.
     *
     * @return array<int, string>
     */
    public function methods(): array;
}
